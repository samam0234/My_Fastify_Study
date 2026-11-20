# studymidpoint. 게시판 한 개

## ① 목표

study0부터 study10까지 배운 Fastify만으로 회원가입, 로그인, 글과 댓글 CRUD가 되는 작은 게시판을 로컬에 띄운다.

## ② 📖 이론

이 문서는 새 프레임워크를 더하지 않는다. `APP_STAGE=basic`일 때 열리는 기능만 서비스로 본다. 업로드, 결제, 메일, AI, 웹소켓, OpenAPI는 심화 구간에 남겨 둔다.

기능 목록은 다음과 같다.

- 건강 확인 `GET /health`
- 회원가입, 로그인, 로그아웃, 내 정보
- 글 목록, 상세, 등록, 수정, 삭제
- 댓글 목록, 등록, 삭제
- 같은 출처 화면에서 로그인과 글쓰기
- 스펙 v1 오류 형식, JSON Schema, CSRF, 비밀번호 해시

왜 화면을 Fastify가 같이 주나. 기초 구간의 연동은 “프론트 경로와 백엔드 경로를 맞추는 것”까지다. `public/`을 `@fastify/static`으로 주면 브라우저는 `http://127.0.0.1:3000/`에서 API와 같은 출처가 된다. 토큰을 `localStorage`에 복사하지 않아도 쿠키가 따라간다.

비유하면 midpoint는 매장을 하루 여는 일이다. 전기(앱), 창고(SQLite), 출입증(JWT), 진열대(화면)가 한 주소에서 맞물리면 된다. 간판(도메인)과 추가 설비는 점검 뒤에 붙인다.

## ③ 🛠️ 실기

### 폴더 구조

```text
src/server.js          listen과 시그널
src/app.js             basic 조립
src/config.js          .env
src/plugins/           db, auth, errors
src/routes/health.js
src/routes/auth.js
src/routes/posts.js
src/routes/comments.js
src/routes/pages.js    public/ 제공
src/db/                sqlite 저장소
public/index.html      게시판 화면
public/js/             api, form, state, main
tests/api.test.js      스펙 계약
```

### 단계별 구현 순서

1. study0. Node 22.5, `npm install`, `.env`, Git 무시 목록을 확인한다.
2. `APP_STAGE=basic`으로 둔다. `DB_CLIENT=sqlite`, `SQLITE_PATH=./data/board.db`다.
3. `npm run dev`로 띄운다. `GET /health`가 `{ "status": "ok" }`인지 본다.
4. `POST /api/auth/signup`으로 사용자를 만든다. 비밀번호는 평문으로 저장되지 않는다.
5. `POST /api/auth/login`으로 토큰과 쿠키를 받는다. `GET /api/auth/me`가 200이다.
6. Bearer 또는 쿠키와 CSRF로 `POST /api/posts`를 보낸다. 201과 `Location`을 확인한다.
7. 목록과 상세, `PATCH`, `DELETE`를 순서대로 보낸다. 남의 글은 403이다.
8. 댓글을 달고, 다른 사용자로는 그 댓글 삭제가 403인지 본다.
9. 브라우저로 `/`를 열어 회원가입, 로그인, 글 작성, 검색, 상세, 댓글을 누른다.
10. `npm test`로 `tests/api.test.js`의 계약이 깨지지 않았는지 본다.

화면 동작은 `public/js/main.js`가 저장소 상태가 바뀔 때마다 인증 구역과 목록 구역을 다시 그린다. 초안은 `localStorage` 키 `fastify-board-draft`다. API 호출은 `public/js/api.js`가 `credentials: 'include'`와 CSRF 헤더를 붙인다.

### DB · API 연동 구성도

```text
브라우저  /
    |  fetch /api/...  (쿠키, x-csrf-token)
    v
Fastify buildApp  APP_STAGE=basic
    |-- plugins/errors     오류 형식, HTML/JSON
    |-- plugins/auth       쿠키를 Bearer로, jwt, 로그
    |-- routes/auth        signup login logout me
    |-- routes/posts       CRUD, Idempotency-Key
    |-- routes/comments
    |-- routes/pages       public/
    v
plugins/db  app.repo
    v
node:sqlite   SQLITE_PATH=./data/board.db
```

환경변수에서 이 그림으로 들어오는 값은 `PORT`, `JWT_SECRET`, `COOKIE_SECURE`, `DB_CLIENT`, `SQLITE_PATH`다.

### 1차 배포 체크리스트

- ☐ `NODE_ENV=production`과 16자 이상의 `JWT_SECRET`으로 기동한다
- ☐ `COOKIE_SECURE`가 접속 방식과 맞다. 로컬 http는 `false`
- ☐ `SQLITE_PATH`가 재시작 후에도 남는 디스크다
- ☐ `GET /health` 200
- ☐ 회원가입, 로그인, 글 작성, 목록, 수정, 삭제가 스펙 상태 코드와 같다
- ☐ 로그아웃 뒤 보호 라우트가 401이다
- ☐ `.env`와 `data/`가 커밋에 없다
- ☐ `npm test`가 통과한다

### 회고

기초 구간에서 일부러 하지 않은 일이 있다. 데이터베이스 엔진 교체, 파일 업로드, 결제, 메일, 문서 요약, 컨테이너 배포는 각각 study11 이후에 붙인다. 그것들을 이 문서의 완료 조건에 넣으면 게시판이 끝나기 전에 범위가 무너진다.

잘 된 경계는 `repo`와 `buildApp`이다. 화면과 테스트가 같은 라우트를 부르고, 저장 방식은 플러그인 뒤에 있다. 아쉬운 경계는 화면이 상태 변경마다 목록 전체를 다시 그린다는 점이다. 입력 중이던 다른 칸이 지워질 수 있다. 기초 완료를 막지는 않고, study12에서 상태를 나눌 때 다룬다.

## ④ 🔗 연동 포인트

화면과 API는 같은 호스트다. 글 목록 버튼은 `GET /api/posts?page=&limit=&q=&sort=`를 부르고, 상세는 `GET /api/posts/:id`를 부른다. 등록은 `POST /api/posts`와 `Idempotency-Key`다.

로그인 상태는 응답 JSON의 토큰을 화면에 저장하지 않는다. Set-Cookie가 브라우저에 남고, 다음 `fetch`가 쿠키를 보낸다. 서버 훅이 그 쿠키를 `request.authUser`로 바꾼다.

1차 배포는 study10의 프로세스 실행이다. 도메인을 붙이기 전에는 `http://127.0.0.1:3000` 점검표만 통과하면 된다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `/api/ai/documents`가 열려 있음 | `APP_STAGE`가 `final` | midpoint 확인 때는 `basic`으로 띄운다 |
| 화면에서만 글쓰기가 403 | CSRF 쿠키를 헤더로 안 넘김 | `api.js`의 `x-csrf-token` 경로를 유지한다 |
| 글은 생겼는데 새로고침하면 없음 | 메모리 DB로 서버를 띄움 | `SQLITE_PATH`가 파일인지 확인한다. `:memory:`는 테스트용이다 |
| 검색이 한 글자라 너무 넓음 | `q`는 부분 일치 | 기대와 다르면 제목 단어를 길게 넣어 본다 |
| 테스트는 되는데 화면이 빈 페이지 | 정적 플러그인 또는 CSP | `/` 상태 200과 `/js/main.js` 상태를 개발자도구에서 본다 |

## ⑥ 직접 해보기

1. `APP_STAGE=basic`으로 서버를 띄우고 브라우저에서 사용자 하나, 글 하나, 댓글 하나를 만든 뒤 로그아웃한다.
2. 두 번째 사용자로 로그인해 첫 글을 수정해 보고 403 문장을 확인한다.
3. 1차 배포 체크리스트를 위에서부터 표시한다. 막힌 항목은 해당 study 번호의 오류 노트로 돌아간다.

## ⑦ ☐ 체크리스트

- ☐ 기능 목록의 건강 확인, 인증, 글, 댓글이 모두 동작한다
- ☐ 폴더가 라우트, 플러그인, DB, 화면으로 나뉘어 있다
- ☐ 구현 순서 1~10을 한 번씩 실행했다
- ☐ 구성도의 `app.repo`와 `SQLITE_PATH`를 설명할 수 있다
- ☐ 1차 배포 체크리스트를 통과했다
- ☐ 회고에서 심화로 미룬 기능과 기초에서 끝낸 기능을 구분했다
- ☐ `npm test`가 통과한다

## ⑧ 다음 단계

게시판은 Fastify 하나로 돈다. study11에서는 같은 `repo` 뒤에 PostgreSQL, MariaDB, MongoDB를 연결해 저장 엔진만 바꿔 본다.
