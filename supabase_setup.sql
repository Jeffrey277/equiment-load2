-- supabase_setup.sql – 공용 장비 대여 현황판 (PRD.md 5장 · 6장)
-- Supabase academy 프로젝트 → SQL Editor에 전체를 붙여 넣고 Run 합니다.
-- 여러 번 실행해도 됩니다. 실행할 때마다 eqp_ 표를 지우고 처음 상태(가상 장비 10개)로 돌아갑니다.
-- ⚠ 그동안 쌓인 대여 기록 · 직접 등록한 장비도 모두 지워집니다. (수업의 edu_ 표는 건드리지 않음)

-- ============================================================
-- 0. 처음 상태로 되돌리기
-- ============================================================
drop table if exists public.eqp_loans cascade;
drop table if exists public.eqp_items cascade;
drop function if exists public.eqp_today() cascade;
drop function if exists public.eqp_items_before_insert() cascade;
drop function if exists public.eqp_items_before_delete() cascade;
drop function if exists public.eqp_loans_before_insert() cascade;
drop function if exists public.eqp_loans_after_insert() cascade;
drop function if exists public.eqp_loans_before_update() cascade;
drop function if exists public.eqp_loans_after_update() cascade;

-- 한국 날짜의 '오늘' (R-05 대여일은 DB가 정한다)
create function public.eqp_today()
returns date
language sql
stable
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- ============================================================
-- 1. 표 2개
-- ============================================================

-- 장비
create table public.eqp_items (
  id          bigint generated always as identity primary key,
  name        text not null check (length(trim(name)) > 0),
  category    text not null check (category in ('노트북', '영상', '측정', '통신', '기타')),
  location    text not null check (length(trim(location)) > 0),
  -- R-07 장비 상태는 대여 · 반납 트리거만 바꾼다 (화면에는 이 칸 수정 권한 없음 → 4장)
  status      text not null default '대여 가능' check (status in ('대여 가능', '대여중')),
  -- R-03 등록한 사람 = 로그인한 사람 (DB가 채움). 비어 있으면 아무도 고칠 수 없는 기본 장비
  owner_id    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 대여 기록
create table public.eqp_loans (
  id           bigint generated always as identity primary key,
  -- R-08 대여 기록이 있는 장비는 삭제 불가
  item_id      bigint not null references public.eqp_items(id) on delete restrict,
  -- R-02 빌린 사람 = 로그인한 사람 (DB가 채움)
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- R-05 대여일 = 오늘(한국 날짜, DB가 채움)
  start_date   date not null default public.eqp_today(),
  due_date     date not null,
  status       text not null default '대여중' check (status in ('대여중', '반납완료')),
  returned_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- R-05 대여일 ≤ 반납예정일 ≤ 대여일 + 7일 (트리거가 먼저 한국어로 거부하고, 이 제약은 마지막 안전장치)
  constraint eqp_loans_due_range check (due_date between start_date and start_date + 7),
  -- R-06 대여중이면 반납 시각 없음, 반납완료면 반납 시각 있음
  constraint eqp_loans_return_pair check (
    (status = '대여중'   and returned_at is null) or
    (status = '반납완료' and returned_at is not null)
  )
);

-- R-04 장비당 '대여중' 기록은 하나만 (두 사람이 동시에 눌러도 한 명만 성공)
create unique index eqp_loans_one_active on public.eqp_loans (item_id) where status = '대여중';

-- ============================================================
-- 2. 트리거
--    거부 메시지는 화면에 그대로 보이므로 한국어로 쓴다. (F-07)
-- ============================================================

-- 장비 등록 : 등록한 사람 · 상태를 DB가 정한다 (R-03, R-07)
create function public.eqp_items_before_insert()
returns trigger
language plpgsql
as $$
begin
  new.owner_id   := auth.uid();      -- SQL Editor에서 넣은 기본 장비는 null
  new.status     := '대여 가능';
  new.created_at := now();
  return new;
end;
$$;

create trigger eqp_items_before_insert
before insert on public.eqp_items
for each row execute function public.eqp_items_before_insert();

-- 장비 삭제 : 대여 기록이 있으면 한국어로 거부 (R-08)
-- security definer : RLS 때문에 남의 대여 기록이 안 보여도 빠짐없이 확인하기 위해
create function public.eqp_items_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.eqp_loans where item_id = old.id) then
    raise exception '대여 기록이 있는 장비는 삭제할 수 없습니다';
  end if;
  return old;
end;
$$;

create trigger eqp_items_before_delete
before delete on public.eqp_items
for each row execute function public.eqp_items_before_delete();

-- 대여 : 빌린 사람 · 대여일 · 상태를 DB가 정하고, 반납예정일 · 중복 대여를 검사 (R-02, R-04, R-05)
-- security definer : 장비 줄을 잠가(for update) 동시 대여를 막기 위해
create function public.eqp_loans_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  -- R-02 빌린 사람
  new.user_id := auth.uid();
  if new.user_id is null then
    raise exception '로그인한 사용자만 대여할 수 있습니다';
  end if;

  -- R-05 대여일 · 반납예정일
  new.start_date  := public.eqp_today();
  new.status      := '대여중';
  new.returned_at := null;
  new.created_at  := now();

  if new.due_date is null then
    raise exception '반납예정일을 골라 주세요';
  end if;
  if new.due_date < new.start_date then
    raise exception '반납예정일은 대여일(%)보다 앞설 수 없습니다', new.start_date;
  end if;
  if new.due_date > new.start_date + 7 then
    raise exception '반납예정일은 대여일부터 7일 이내(%까지)여야 합니다', new.start_date + 7;
  end if;

  -- R-04 이미 대여중인 장비는 다시 대여 불가 (장비 줄을 잠가 동시에 눌러도 한 명만 통과)
  select status into v_status from public.eqp_items where id = new.item_id for update;
  if not found then
    raise exception '없는 장비입니다';
  end if;
  if v_status <> '대여 가능' then
    raise exception '이미 대여중인 장비입니다';
  end if;

  return new;
end;
$$;

create trigger eqp_loans_before_insert
before insert on public.eqp_loans
for each row execute function public.eqp_loans_before_insert();

-- 대여 뒤 : 장비 상태를 '대여중'으로 (R-07)
create function public.eqp_loans_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.eqp_items set status = '대여중' where id = new.item_id;
  return null;
end;
$$;

create trigger eqp_loans_after_insert
after insert on public.eqp_loans
for each row execute function public.eqp_loans_after_insert();

-- 반납 : '대여중' → '반납완료' 한 방향만, 반납 시각은 DB가 기록, 반납된 대여는 고칠 수 없음 (R-06)
create function public.eqp_loans_before_update()
returns trigger
language plpgsql
as $$
begin
  if old.status = '반납완료' then
    raise exception '이미 반납된 대여는 고칠 수 없습니다';
  end if;
  if new.status is distinct from '반납완료' then
    raise exception '대여 기록은 반납(반납완료)만 할 수 있습니다';
  end if;

  -- 반납 말고 다른 칸은 그대로 둔다
  new.id         := old.id;
  new.item_id    := old.item_id;
  new.user_id    := old.user_id;
  new.start_date := old.start_date;
  new.due_date   := old.due_date;
  new.created_at := old.created_at;
  new.returned_at := now();
  return new;
end;
$$;

create trigger eqp_loans_before_update
before update on public.eqp_loans
for each row execute function public.eqp_loans_before_update();

-- 반납 뒤 : 장비 상태를 '대여 가능'으로 (R-07)
create function public.eqp_loans_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = '대여중' and new.status = '반납완료' then
    update public.eqp_items set status = '대여 가능' where id = new.item_id;
  end if;
  return null;
end;
$$;

create trigger eqp_loans_after_update
after update on public.eqp_loans
for each row execute function public.eqp_loans_after_update();

-- ============================================================
-- 3. RLS 정책
-- ============================================================
alter table public.eqp_items enable row level security;
alter table public.eqp_loans enable row level security;

-- R-01 장비 목록은 누구나 읽기
create policy eqp_items_select on public.eqp_items
  for select to anon, authenticated
  using (true);

-- R-03 장비 등록은 로그인한 사람, 등록한 사람 = 본인
create policy eqp_items_insert on public.eqp_items
  for insert to authenticated
  with check (auth.uid() = owner_id);

-- R-03 장비 수정 · 삭제는 등록한 본인만
create policy eqp_items_update on public.eqp_items
  for update to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy eqp_items_delete on public.eqp_items
  for delete to authenticated
  using (auth.uid() = owner_id);

-- R-02 대여 기록은 본인 것만 읽고 · 빌리고 · 반납 (삭제 정책은 없음 = 아무도 못 지움)
create policy eqp_loans_select on public.eqp_loans
  for select to authenticated
  using (auth.uid() = user_id);

create policy eqp_loans_insert on public.eqp_loans
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy eqp_loans_update on public.eqp_loans
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 4. 칸별 권한 — 화면(공개용 키)이 보낼 수 있는 칸만 허락
-- ============================================================
revoke all on public.eqp_items from anon, authenticated;
revoke all on public.eqp_loans from anon, authenticated;

-- R-01 로그인 전(anon) : eqp_items 읽기만. eqp_loans는 아무 권한 없음
grant select on public.eqp_items to anon;

-- 로그인 후(authenticated)
grant select on public.eqp_items to authenticated;
grant insert (name, category, location) on public.eqp_items to authenticated;   -- R-03, R-07 owner_id · status는 못 보냄
grant update (name, category, location) on public.eqp_items to authenticated;   -- R-07 status 칸 수정 권한 없음
grant delete on public.eqp_items to authenticated;                               -- R-03 (본인 것만 = RLS), R-08

grant select on public.eqp_loans to authenticated;                               -- R-02 (본인 것만 = RLS)
grant insert (item_id, due_date) on public.eqp_loans to authenticated;           -- R-02, R-05 user_id · start_date는 못 보냄
grant update (status) on public.eqp_loans to authenticated;                      -- R-06 반납(status)만

-- ============================================================
-- 5. 가상 장비 10개 (등록한 사람 없음 = 아무도 수정 · 삭제 못 하는 기본 장비)
-- ============================================================
insert into public.eqp_items (name, category, location) values
  ('업무용 노트북 A',     '노트북', '3층 총무팀'),
  ('업무용 노트북 B',     '노트북', '3층 총무팀'),
  ('빔프로젝터',          '영상',   '2층 회의실 비품장'),
  ('휴대용 스크린',       '영상',   '2층 회의실 비품장'),
  ('열화상 카메라',       '측정',   '1층 설비팀'),
  ('휴대용 가스 측정기',  '측정',   '1층 설비팀'),
  ('소음 측정기',         '측정',   '1층 설비팀'),
  ('무전기 1호',          '통신',   '1층 경비실'),
  ('무전기 2호',          '통신',   '1층 경비실'),
  ('전선 릴',             '기타',   '지하 1층 창고');

-- 화면(API)이 새 표를 바로 알아보게
notify pgrst, 'reload schema';

-- ============================================================
-- 6. 확인 : 결과 10줄 (모두 '대여 가능', owner_id 비어 있음)
-- ============================================================
select id, name, category, location, status, owner_id
from public.eqp_items
order by id;
