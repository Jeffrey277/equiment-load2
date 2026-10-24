# CLAUDE.md – 공용 장비 대여 현황판 작업 규칙

> 4회차 과제 · 무엇을 만들지는 PRD.md, 어떻게 만들지는 이 파일을 따릅니다.

## 프로젝트 개요
- 교육용 프로토타입이다. 무엇을 만들지는 PRD.md를 따른다.
- PRD.md에 없는 기능은 먼저 제안하고, 내가 승인한 뒤에만 구현한다.

## 기술 스택 (변경 금지)
- HTML + CSS + 순수 JavaScript만 사용한다. (React 등 프레임워크, 빌드 도구 사용 금지)
- 외부 CDN은 supabase-js 하나만 허용한다.
  `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
- 데이터는 Supabase DB(academy 프로젝트)에 저장한다. (localStorage 사용 안 함)
- 로그인은 Supabase Auth 이메일 + 비밀번호만 쓴다. (signUp · signInWithPassword · signOut · getSession · onAuthStateChange) 로그인 유지는 supabase-js 기본 동작에 맡긴다.
- 서버 프로그램(Node·Python 등)은 만들지 않는다. 정적 파일만 Vercel에 배포한다.

## 폴더 구조
- index.html : 화면 구조
- style.css  : 디자인 (로그인 전 머리글 남색 / 로그인 후 초록, 연체 줄 빨강)
- config.js  : Supabase 주소와 공개용 키 두 줄만 둔다 (이미 있음, 값만 채운다)
- logic.js   : 계산·판정 규칙만 (화면 · Supabase를 다루는 코드 금지)
- app.js     : 화면 동작 (로그인, 입력 받기, 목록 그리기, 버튼 이벤트)
- test.html  : logic.js 자동 테스트 (완료 기준 T-xx를 PASS/FAIL 표로 표시)
- supabase_setup.sql : 표·규칙·권한·트리거·가상 장비 10개. DB 규칙을 바꾸면 이 파일도 고친다
- index.html은 supabase-js → config.js → logic.js → app.js 순서로 불러온다.

## 작업 방식
1. 코드를 고치기 전에 계획(수정할 파일·함수와 이유)을 먼저 보여주고 승인을 받는다.
2. 한 번에 PRD의 Phase 하나만 구현한다.
3. 업무 규칙(R-xx)을 만들거나 고치면 test.html에 해당 완료 기준(T-xx) 테스트를 추가한다.
4. 작업이 끝나면 변경한 파일, 내가 확인할 방법, 남은 문제를 보고한다.
5. 오류 수정 요청을 받으면 원인을 2~3줄로 먼저 설명하고, 해당 줄만 고친다. 잘 되던 기능은 건드리지 않는다.
6. SQL을 바꾸면 내가 Supabase SQL Editor에서 직접 실행해야 한다. 실행할 부분만 따로 보여 준다.
7. Git : Phase 1은 main 가지에 바로 커밋 · push한다. Phase 2는 내가 말하면 `phase2` 가지를 만들어 커밋 · push한다. (Preview 확인 → Merge는 내가 GitHub에서 한다) 그 밖에는 내가 따로 말하지 않으면 새 가지를 만들지 않는다.

## 코딩 규칙
- 함수 이름과 화면 요소 id는 아래 '이름 표'를 그대로 쓴다. 새로 만들면 표에 추가한다.
- 주석과 화면 문구는 한국어로 쓴다. 날짜는 YYYY-MM-DD로 표시한다.
- 날짜 문자열을 만들 때 toISOString()을 쓰지 않는다. (한국 시간에서 하루가 밀림)
- 사용자가 입력한 글자는 textContent로 표시한다. (innerHTML에 그대로 넣지 않기)
- Supabase 호출(DB · Auth 모두)은 app.js 맨 위 '저장 위치' 구역의 함수 안에서만 한다. 오류가 오면 throw해서 화면 함수가 showMessage()로 보여 주게 한다.
- DB가 거부하면 error.message를 그대로 보여 준다. 그래서 SQL 트리거의 거부 메시지(raise exception)는 한국어로 쓴다. (예: "이미 대여중인 장비입니다")
- 데이터를 바꾼 뒤(대여 · 반납 · 등록 · 수정 · 삭제)와 로그인 · 로그아웃 뒤에는 loadData()로 DB에서 다시 읽어 renderAll()로 화면 전체를 다시 그린다. (DB가 바꾼 장비 상태를 그대로 보여 주기 위해)
- 로그인 여부에 따른 화면 차이는 renderAll() 안에서 currentUser 하나로만 판단한다.

## 보안·데이터 규칙
- 가상 데이터만 사용한다. 실제 이름·연락처·기관 내부자료를 코드와 샘플에 넣지 않는다.
- 이름 · 연락처 입력칸은 만들지 않는다. 화면에 보이는 사람 정보는 '내 이메일' 하나뿐이다.
- 표 이름은 PRD.md 5장을 따르고 `eqp_` 로 시작한다. 수업의 `edu_` 표는 건드리지 않는다.
- 화면 코드에는 공개용 키(Publishable 또는 anon)만 쓴다. **비밀 키(Secret 또는 service_role)는 절대 코드·채팅·GitHub에 넣지 않는다.**
- 업무 규칙(R-01 ~ R-08)은 DB(supabase_setup.sql)가 최종 판정한다. 화면은 버튼을 숨기고 날짜 범위를 안내만 한다.
- 남의 대여 기록(eqp_loans)은 화면에서 조회하지 않는다. 장비가 '대여중'인지는 eqp_items.status로만 안다. (R-02)

## 프로젝트 전용 규칙
### 이름 표
| 구분      | 이름                                                                   |
|---|---|
| 함수(logic.js) | todayStr(), formatDate(d), parseDate(str), addDays(str, n), maxDueDate(startDate), isValidDueDate(startDate, dueDate), isOverdue(loan, today), canBorrow(item, userId), canEditItem(item, userId), summarize(items, myLoans, today, loggedIn), filterItems(items, keyword, category, status), sortMyLoans(loans), toItem(row), toLoan(row) |
| 함수(app.js) 저장 | dbError(error), authError(error), getCurrentUser(), signUp(email, password), signIn(email, password), signOut(), loadData(), insertLoan(itemId, dueDate), returnLoan(loanId), insertItem(item), updateItem(id, fields), deleteItem(id) |
| 함수(app.js) 화면 | el(id), renderAll(), renderHeader(), renderSummary(), renderLeftPanel(), renderItemTable(), renderMyLoans(), readLoginInputs(), handleLogin(event), handleSignUp(), handleLogout(), openLoanPanel(itemId), confirmLoan(), returnItem(loanId, btn), saveItem(), editItem(id), cancelEdit(), removeItem(id), reloadData(), showMessage(text, type), start() |
| 상수 | LOAN_MAX_DAYS (logic.js, 7), AUTH_MESSAGES (app.js) |
| 전역 변수(app.js) | sb (Supabase 클라이언트), currentUser, items, myLoans, selectedItemId, editingId |
| 화면 id   | appHeader, headerStatus, userEmail, logoutBtn, reloadBtn, summaryCards, loginForm, emailInput, passwordInput, loginBtn, signupBtn, itemForm, itemNameInput, itemCategorySelect, itemLocationInput, saveItemBtn, cancelEditBtn, loanPanel, loanItemName, dueDateInput, confirmLoanBtn, searchInput, categoryFilter, statusFilter, itemTable, myLoansSection, myLoansHint, myLoansTable, msgBox |
| 설정(config.js) | SUPABASE_URL, SUPABASE_KEY |
| DB 표 | eqp_items, eqp_loans |

### 주의사항
- 장비 상태(status)는 화면에서 고치지 않는다. 대여 · 반납 때 DB 트리거가 바꾼다. updateItem()에는 name · category · location만 보낸다. (R-07)
- 대여할 때 화면은 item_id와 due_date만 보낸다. user_id · start_date · status는 DB가 채운다. (R-02, R-05)
- 반납할 때 화면은 status = '반납완료'만 보낸다. returned_at은 DB가 기록한다. (R-06)
- 반납예정일 입력(dueDateInput)의 min = todayStr(), max = maxDueDate(todayStr())로 둔다. 판정은 isValidDueDate()로 미리 안내만 하고 최종은 DB. (R-05)
- [대여] 버튼은 canBorrow(), [수정] [삭제] 버튼은 canEditItem()으로만 판단한다. (R-03, R-04)
- 연체 여부는 isOverdue()로만 판단한다. '내 연체' 카드(Phase 1)와 빨간 줄(Phase 2)이 같은 함수를 쓴다. (R-09)
- 장비 등록 폼은 수정에도 같이 쓴다. editingId가 있으면 saveItem()이 updateItem(), 없으면 insertItem()을 부른다.
- 선택 목록 값 : 분류 = 노트북 / 영상 / 측정 / 통신 / 기타, 장비 상태 = 대여 가능 / 대여중, 대여 상태 = 대여중 / 반납완료

## 자주 발생한 오류와 해결 (Debug Loop에서 배운 것 – 계속 추가)
- getElementById 결과는 사용 전에 있는지 확인하고, 없으면 콘솔에 '요소 없음: id'를 표시한다.
