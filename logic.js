// logic.js – 계산·판정 규칙만 (화면 · Supabase를 다루는 코드 금지)
// 최종 판정은 DB(supabase_setup.sql)가 한다. 여기 함수는 화면 안내와 테스트용이다.

const LOAN_MAX_DAYS = 7; // R-05 반납예정일은 대여일부터 7일 이내

// ---------- 날짜 ----------

// Date → 'YYYY-MM-DD' (toISOString()은 한국 시간에서 하루가 밀려서 쓰지 않음)
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// 오늘(한국 날짜) 'YYYY-MM-DD' — PC 시간대와 상관없이 DB의 eqp_today()와 같은 날짜
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// 'YYYY-MM-DD' → Date (그 날 0시, 이 PC 시간 기준)
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 'YYYY-MM-DD'에 n일을 더한 날짜
function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

// ---------- 대여 날짜 (R-05) ----------

// 고를 수 있는 마지막 반납예정일 = 대여일 + 7일
function maxDueDate(startDate) {
  return addDays(startDate, LOAN_MAX_DAYS);
}

// 대여일 ≤ 반납예정일 ≤ 대여일 + 7일
function isValidDueDate(startDate, dueDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate || '')) return false;
  return dueDate >= startDate && dueDate <= maxDueDate(startDate);
}

// ---------- 판정 ----------

// R-09 연체 = 대여중이고 오늘이 반납예정일보다 뒤
function isOverdue(loan, today) {
  return loan.status === '대여중' && today > loan.dueDate;
}

// [대여] 버튼 : 로그인했고 장비가 대여 가능일 때만 (R-01, R-04)
function canBorrow(item, userId) {
  return !!userId && item.status === '대여 가능';
}

// ---------- 요약 · 정렬 ----------

// 요약 카드 : 로그인 전 3개, 로그인 후 5개 (F-03)
// '대여중'은 장비 표의 상태로만 센다. 남의 대여 기록은 보지 않는다. (R-02)
function summarize(items, myLoans, today, loggedIn) {
  const cards = [
    { label: '전체 장비', value: items.length },
    { label: '대여 가능', value: items.filter(i => i.status === '대여 가능').length },
    { label: '대여중', value: items.filter(i => i.status === '대여중').length }
  ];
  if (loggedIn) {
    cards.push({ label: '내 대여중', value: myLoans.filter(l => l.status === '대여중').length });
    cards.push({ label: '내 연체', value: myLoans.filter(l => isOverdue(l, today)).length, alert: true });
  }
  return cards;
}

// 내 대여 : 대여중 먼저(반납예정일 빠른 순), 그다음 반납완료(최근 반납 먼저) (F-05)
function sortMyLoans(loans) {
  return loans.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === '대여중' ? -1 : 1;
    if (a.status === '대여중') return a.dueDate.localeCompare(b.dueDate) || a.id - b.id;
    return String(b.returnedAt || '').localeCompare(String(a.returnedAt || '')) || b.id - a.id;
  });
}

// ---------- DB 줄 → 화면 이름 (PRD 5장) ----------

function toItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    location: row.location,
    status: row.status,
    ownerId: row.owner_id,
    createdAt: row.created_at
  };
}

function toLoan(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    userId: row.user_id,
    startDate: row.start_date,
    dueDate: row.due_date,
    status: row.status,
    returnedAt: row.returned_at,
    createdAt: row.created_at
  };
}
