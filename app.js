// app.js – 화면 동작 (로그인, 목록 그리기, 버튼 이벤트)

// ============================================================
// 저장 위치 — Supabase 호출(DB · 로그인)은 이 구역의 함수 안에서만 한다.
// 오류가 오면 throw해서 화면 함수가 showMessage()로 보여 준다.
// ============================================================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DB가 거부한 이유를 화면에 그대로 (F-07)
// 트리거가 낸 한국어 거부(P0001)는 그대로, 권한 · 제약 오류(영문)는 앞에 안내를 붙인다.
function dbError(error) {
  if (error.code === 'P0001') return new Error(error.message);
  return new Error('DB가 거부했습니다 : ' + error.message);
}

// 로그인 오류 : 자주 나오는 영문 메시지 3가지만 한국어로, 나머지는 원문 그대로
const AUTH_MESSAGES = [
  ['Invalid login credentials', '이메일 또는 비밀번호가 맞지 않습니다'],
  ['User already registered', '이미 가입된 이메일입니다. [로그인]을 눌러 주세요'],
  ['Password should be at least 6 characters', '비밀번호는 6자 이상이어야 합니다']
];

function authError(error) {
  const found = AUTH_MESSAGES.find(([en]) => error.message.startsWith(en));
  return new Error(found ? found[1] : '로그인 오류 : ' + error.message);
}

// 지금 로그인한 사람 (새로고침해도 supabase-js가 로그인을 유지한다)
async function getCurrentUser() {
  const { data, error } = await sb.auth.getSession();
  if (error) throw authError(error);
  return data.session ? data.session.user : null;
}

async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw authError(error);
  if (!data.session) {
    throw new Error('가입은 됐지만 메일 확인이 필요합니다. Supabase에서 "Confirm email"을 꺼 주세요');
  }
  return data.user;
}

async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw authError(error);
  return data.user;
}

async function signOut() {
  const { error } = await sb.auth.signOut();
  if (error) throw authError(error);
}

// 장비는 항상, 내 대여는 로그인했을 때만 읽는다 (R-01, R-02)
async function loadData() {
  const { data: itemRows, error: itemError } = await sb.from('eqp_items').select('*').order('id');
  if (itemError) throw dbError(itemError);
  items = itemRows.map(toItem);

  myLoans = [];
  if (currentUser) {
    const { data: loanRows, error: loanError } = await sb
      .from('eqp_loans').select('*').eq('user_id', currentUser.id);
    if (loanError) throw dbError(loanError);
    myLoans = sortMyLoans(loanRows.map(toLoan));
  }
}

// 대여 : 장비와 반납예정일만 보낸다. 빌린 사람 · 대여일 · 상태는 DB가 정한다 (R-02, R-05, R-07)
async function insertLoan(itemId, dueDate) {
  const { data, error } = await sb
    .from('eqp_loans').insert({ item_id: itemId, due_date: dueDate }).select().single();
  if (error) throw dbError(error);
  return toLoan(data);
}

// 반납 : 상태만 보낸다. 반납 시각은 DB가 기록한다 (R-06)
async function returnLoan(loanId) {
  const { data, error } = await sb
    .from('eqp_loans').update({ status: '반납완료' }).eq('id', loanId).select();
  if (error) throw dbError(error);
  // RLS 때문에 남의 대여는 0줄로 끝난다 (R-02)
  if (data.length === 0) throw new Error('본인이 빌린 대여만 반납할 수 있습니다');
  return toLoan(data[0]);
}

// ============================================================
// 화면
// ============================================================

let currentUser = null;     // 로그인한 사람 (없으면 null)
let items = [];             // 장비 목록
let myLoans = [];           // 내 대여 기록
let selectedItemId = null;  // 대여 패널에 고른 장비

// 화면 요소 찾기 — 없으면 콘솔에 알린다
function el(id) {
  const found = document.getElementById(id);
  if (!found) console.error('요소 없음: ' + id);
  return found;
}

function showMessage(text, type) {
  const box = el('msgBox');
  box.textContent = text;
  box.className = 'msg msg-' + (type || 'ok');
  box.hidden = false;
}

// 로그인 전 · 후 화면 차이는 여기서 currentUser 하나로만 판단한다 (PRD 4장)
function renderAll() {
  renderHeader();
  renderSummary();
  renderLeftPanel();
  renderItemTable();
  renderMyLoans();
}

function renderHeader() {
  document.body.classList.toggle('logged-in', !!currentUser);
  el('headerStatus').textContent = currentUser ? '로그인 :' : '로그인 전 — 보기만 가능';
  el('userEmail').textContent = currentUser ? currentUser.email : '';
  el('logoutBtn').hidden = !currentUser;
}

function renderSummary() {
  const box = el('summaryCards');
  box.replaceChildren();
  summarize(items, myLoans, todayStr(), !!currentUser).forEach(card => {
    const div = document.createElement('div');
    div.className = 'card' + (card.alert && card.value > 0 ? ' card-alert' : '');
    const label = document.createElement('span');
    label.className = 'card-label';
    label.textContent = card.label;
    const value = document.createElement('strong');
    value.className = 'card-value';
    value.textContent = card.value;
    div.append(label, value);
    box.append(div);
  });
}

function renderLeftPanel() {
  el('loginForm').hidden = !!currentUser;
  el('loanPanel').hidden = !currentUser;
  if (!currentUser) return;

  // 고른 장비가 그사이 대여중이 되었으면 선택을 푼다
  const item = items.find(i => i.id === selectedItemId);
  if (!item || !canBorrow(item, currentUser.id)) selectedItemId = null;

  const today = todayStr();
  const dueInput = el('dueDateInput');
  dueInput.min = today;
  dueInput.max = maxDueDate(today);
  el('loanItemName').textContent = selectedItemId ? item.name : '목록에서 [대여]를 누르세요';
  dueInput.disabled = !selectedItemId;
  el('confirmLoanBtn').disabled = !selectedItemId;
}

function renderItemTable() {
  const table = el('itemTable');
  table.replaceChildren();

  const heads = ['장비', '분류', '보관 위치', '상태'];
  if (currentUser) heads.push('할 일');
  const headRow = table.createTHead().insertRow();
  heads.forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.append(th);
  });

  const body = table.createTBody();
  if (items.length === 0) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = heads.length;
    cell.className = 'empty';
    cell.textContent = '장비가 없습니다';
    return;
  }

  items.forEach(item => {
    const row = body.insertRow();
    row.insertCell().textContent = item.name;
    row.insertCell().textContent = item.category;
    row.insertCell().textContent = item.location;

    const badge = document.createElement('span');
    badge.className = 'badge ' + (item.status === '대여 가능' ? 'badge-available' : 'badge-loaned');
    badge.textContent = item.status;
    row.insertCell().append(badge);

    if (currentUser) {
      const actions = row.insertCell();
      if (canBorrow(item, currentUser.id)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'small';
        btn.textContent = '대여';
        btn.addEventListener('click', () => openLoanPanel(item.id));
        actions.append(btn);
      }
    }
  });
}

function renderMyLoans() {
  const hint = el('myLoansHint');
  const table = el('myLoansTable');
  table.replaceChildren();

  if (!currentUser) {
    hint.textContent = '로그인하면 볼 수 있습니다';
    hint.hidden = false;
    table.hidden = true;
    return;
  }
  if (myLoans.length === 0) {
    hint.textContent = '빌린 장비가 없습니다';
    hint.hidden = false;
    table.hidden = true;
    return;
  }
  hint.hidden = true;
  table.hidden = false;

  const headRow = table.createTHead().insertRow();
  ['장비', '대여일', '반납예정일', '상태', '할 일'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    headRow.append(th);
  });

  const body = table.createTBody();
  myLoans.forEach(loan => {
    const item = items.find(i => i.id === loan.itemId);
    const row = body.insertRow();
    row.insertCell().textContent = item ? item.name : '장비 #' + loan.itemId;
    row.insertCell().textContent = loan.startDate;
    row.insertCell().textContent = loan.dueDate;
    row.insertCell().textContent = loan.status;

    const actions = row.insertCell();
    if (loan.status === '대여중') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'small';
      btn.textContent = '반납';
      btn.addEventListener('click', () => returnItem(loan.id, btn));
      actions.append(btn);
    }
  });
}

// DB에서 다시 읽어 화면 전체를 그린다. 성공하면 true
async function reloadData() {
  try {
    await loadData();
    renderAll();
    return true;
  } catch (err) {
    renderAll();
    showMessage(err.message, 'error');
    return false;
  }
}

function readLoginInputs() {
  const email = el('emailInput').value.trim();
  const password = el('passwordInput').value;
  if (!email || !password) {
    showMessage('이메일과 비밀번호를 입력해 주세요', 'error');
    return null;
  }
  return { email, password };
}

// 로그인 · 가입 · 로그아웃 뒤 화면은 onAuthStateChange가 다시 그린다
async function handleLogin(event) {
  event.preventDefault();
  const input = readLoginInputs();
  if (!input) return;
  try {
    await signIn(input.email, input.password);
    el('passwordInput').value = '';
    showMessage('로그인했습니다', 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

async function handleSignUp() {
  const input = readLoginInputs();
  if (!input) return;
  try {
    await signUp(input.email, input.password);
    el('passwordInput').value = '';
    showMessage('가입했습니다. 바로 로그인되었습니다', 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

async function handleLogout() {
  try {
    await signOut();
    showMessage('로그아웃했습니다', 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

function openLoanPanel(itemId) {
  selectedItemId = itemId;
  renderLeftPanel();
  // 기본 반납예정일 = 3일 뒤 (명세 2장 장면)
  const dueInput = el('dueDateInput');
  dueInput.value = addDays(todayStr(), 3);
  dueInput.focus();
}

async function confirmLoan() {
  const btn = el('confirmLoanBtn');
  const today = todayStr();
  const dueDate = el('dueDateInput').value;
  if (!selectedItemId) {
    showMessage('목록에서 빌릴 장비의 [대여]를 먼저 누르세요', 'error');
    return;
  }
  // 화면은 미리 안내만 한다. 최종 판정은 DB (R-05)
  if (!isValidDueDate(today, dueDate)) {
    showMessage('반납예정일은 ' + today + ' ~ ' + maxDueDate(today) + ' 사이에서 골라 주세요', 'error');
    return;
  }

  btn.disabled = true;
  try {
    await insertLoan(selectedItemId, dueDate);
    selectedItemId = null;
    if (await reloadData()) showMessage('대여했습니다 (반납예정일 ' + dueDate + ')', 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
    // 다른 사람이 먼저 빌렸을 수 있으니 목록을 다시 읽되, 거부 이유는 그대로 둔다
    try { await loadData(); } catch (e) { console.error(e); }
    renderAll();
  } finally {
    btn.disabled = !selectedItemId;
  }
}

async function returnItem(loanId, btn) {
  btn.disabled = true;
  try {
    await returnLoan(loanId);
    if (await reloadData()) showMessage('반납했습니다', 'ok');
  } catch (err) {
    showMessage(err.message, 'error');
    btn.disabled = false;
  }
}

// ============================================================
// 시작
// ============================================================

async function start() {
  el('loginForm').addEventListener('submit', handleLogin);
  el('signupBtn').addEventListener('click', handleSignUp);
  el('logoutBtn').addEventListener('click', handleLogout);
  el('confirmLoanBtn').addEventListener('click', confirmLoan);
  el('reloadBtn').addEventListener('click', async () => {
    if (await reloadData()) showMessage('새로 불러왔습니다', 'ok');
  });

  try {
    currentUser = await getCurrentUser();
  } catch (err) {
    showMessage(err.message, 'error');
  }
  await reloadData();

  // 로그인 · 로그아웃(다른 탭 포함)이 생기면 다시 읽어 그린다
  sb.auth.onAuthStateChange((event, session) => {
    const user = session ? session.user : null;
    const sameUser = (user ? user.id : null) === (currentUser ? currentUser.id : null);
    if (sameUser) return;
    currentUser = user;
    selectedItemId = null;
    // 이 콜백 안에서 Supabase를 바로 부르면 멈출 수 있어 한 박자 늦춘다
    setTimeout(reloadData, 0);
  });
}

start();
