# study10. 배포와 기초 정리

## ① 목표

Fastify 앱을 프로세스 하나로 띄우는 배포의 뼈대를 이해하고, 환경변수와 DB를 배포 환경에 이은 뒤 기초 구간을 점검표로 닫는다.

## ② 📖 이론

이 프로젝트는 컴파일 단계가 없다. 빌드는 “어느 파일을 어느 Node로 실행하는가”다. `npm start`는 `node src/server.js`다. 의존성은 `npm ci`로 잠금 파일 그대로 설치한다. `node_modules`를 복사해 배포하지 않는다.

도메인은 사람이 치는 이름이고, 서버는 IP와 포트다. DNS가 이름을 주소로 바꾼 뒤, 앞단의 프록시가 443번 HTTPS를 받아 앱의 3000번 HTTP로 넘긴다. 앱 코드가 인증서를 직접 읽지 않아도 된다. 대신 프록시가 넘긴 `X-Forwarded-*`를 믿으려면 `TRUST_PROXY=true`다. 아무 프록시도 없는데 이 값을 켜면 클라이언트가 위조한 프로토콜을 믿게 된다.

HTTPS가 필요한 이유는 쿠키와 토큰이 그 연결 위에 있기 때문이다. 운영의 `COOKIE_SECURE` 기본값은 참이다. 프록시가 HTTPS를 끝내고 앱에는 HTTP로 붙여도, 브라우저와 프록시 사이가 HTTPS이면 쿠키의 `secure`는 참이 맞다. 로컬 학습은 그 앞단이 없어서 `false`다.

배포 환경의 연결은 코드 수정이 아니라 환경변수다.

- `NODE_ENV=production`이면 개발용 JWT 비밀로 기동하지 못한다.
- `JWT_SECRET`은 그 환경의 비밀 저장소에서만 넣는다.
- `DB_CLIENT=sqlite`와 `SQLITE_PATH`는 디스크가 유지되는 경로여야 한다. 컨테이너를 지울 때 같이 사라지는 경로에 두면 글이 사라진다.
- `PUBLIC_BASE_URL`은 메일과 OAuth가 사람 앞에 보여 줄 주소다.
- `CORS_ORIGIN`은 화면을 다른 출처에 둘 때만 그 출처로 맞춘다. 같은 서버의 `public/`이면 앱 자신의 출처다.

비유하면 도메인은 간판, HTTPS는 봉인된 봉투, 환경변수는 매장마다 다른 열쇠와 창고 주소다. 간판을 소스 코드에 박아 두지 않는다.

기초 구간에서 만든 것은 한 줄로 이렇게 닫힌다. Fastify 앱이 플러그인으로 나뉘고, JSON Schema와 오류 형식이 입력을 거르고, SQLite `repo`가 스펙 v1의 글과 댓글을 저장하고, 훅이 토큰과 CSRF와 로그를 처리하며, 같은 출처 화면이 그 API를 부른다.

## ③ 🛠️ 실기

로컬에서 운영 모드에 가깝게 띄우는 최소 절차다.

```text
npm ci
set NODE_ENV=production
set JWT_SECRET=길이가-16자-넘는-무작위-값
set COOKIE_SECURE=false
set HOST=127.0.0.1
set PORT=3000
set DB_CLIENT=sqlite
set SQLITE_PATH=./data/board.db
npm start
```

PowerShell이면 `$env:NODE_ENV="production"`처럼 현재 세션에만 넣는다. 비밀을 `.env`에 적었다면 `NODE_ENV=production`만 셸에 두고 나머지는 파일이 채운다. 이미 셸에 빈 값이 있으면 파일이 덮어쓰지 못한다.

배포 후 점검표다.

1. `GET /health`가 200 `{ "status": "ok" }`이고 `x-request-id`가 있다.
2. 회원가입 201, 로그인 200, 잘못된 비밀번호 401이다.
3. 글 작성 201의 `Location`으로 상세 200이 나온다.
4. 목록 `meta`에 `page`, `limit`, `total`, `totalPages`, `q`가 있다.
5. 남의 글 수정이 403, 없는 번호가 404, 깨진 JSON이 400 `BAD_REQUEST`다.
6. 쿠키로 연 화면이 글을 쓰고, 로그아웃 뒤 쓰기가 401이다.
7. 프로세스를 다시 시작해도 `SQLITE_PATH`의 글이 남는다.
8. 응답 본문에 스택과 `JWT_SECRET`이 없다.
9. `data/`와 `.env`가 Git 상태에 없다.

도메인을 붙일 때의 개념 순서다. 이름을 서버 주소에 연결하고, 프록시가 443을 앱 포트로 넘기고, `PUBLIC_BASE_URL`을 `https://그-이름`으로 바꾸고, `COOKIE_SECURE=true`로 둔다. 인증서 발급 자체는 프록시나 호스팅의 기능이다. 앱은 그 뒤에서 HTTP로 listen한다.

기초 구간 지도다.

| 문서 | 남긴 것 |
| --- | --- |
| study0 | Node, 폴더, Git, `.env` |
| study1 | 첫 HTML과 JSON |
| study2 | 앱, 플러그인, 라우트 |
| study3 | 파일과 `localStorage` |
| study4 | 경로와 오류 형식 |
| study5 | JSON Schema와 멱등 키 |
| study6 | SQLite CRUD와 스펙 v1 |
| study7 | 토큰, 쿠키, 해시, CORS, CSRF |
| study8 | 한 개의 `buildApp`과 환경 분리 |
| study9 | `inject` 테스트와 로그 |

## ④ 🔗 연동 포인트

배포 머신의 환경변수가 `resolveConfig`로 들어가고, `openDatabase`가 `SQLITE_PATH` 또는 `DATABASE_URL`을 연다. 앱 코드의 기본 경로는 `./data/board.db`라서, 배포에서 경로를 바꾸지 않으면 그 상대 경로에 파일이 생긴다. 재시작 후에도 그 디스크가 같은 자리여야 한다.

`GET /health`의 `repo.ping()`이 실패하면 프로세스는 떠 있어도 점검 1번이 실패한다. 배포 직후 이 경로를 먼저 본다.

화면은 같은 프로세스가 `public/`을 제공한다. 도메인 하나로 `/`와 `/api`가 같이 열리면 CORS를 넓힐 필요가 없다. 화면만 다른 도메인이면 `CORS_ORIGIN`을 그 도메인으로 맞추고 `credentials`가 이미 켜져 있는지 확인한다.

study16에서 이 점검표를 컨테이너와 GitHub Actions 안으로 옮긴다. 기초 배포의 계약은 여기서 끝나 있다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 배포 직후 글이 사라짐 | DB 파일이 임시 디스크에 있음 | `SQLITE_PATH`를 유지되는 디스크에 둔다 |
| 운영 기동이 개발 비밀에서 멈춤 | `JWT_SECRET` 미설정 | 환경 비밀을 넣고 코드 상수는 쓰지 않는다 |
| HTTPS 사이트인데 로그인이 유지되지 않음 | `COOKIE_SECURE=false` 또는 도메인 불일치 | 참과 `PUBLIC_BASE_URL`의 호스트를 맞춘다 |
| 프록시 뒤에서 주소가 http로 보임 | `TRUST_PROXY`가 꺼져 있음 | 진짜 프록시가 있을 때만 켠다 |
| `npm install` 결과가 로컬과 다름 | 잠금 파일을 안 씀 | 배포는 `npm ci`를 쓴다 |
| 점검 중 500 | 스키마 미생성 또는 권한 | 로그의 `requestId`로 스택을 보고 데이터 디렉터리 쓰기 권한을 확인한다 |

## ⑥ 직접 해보기

1. `NODE_ENV=production`과 충분한 `JWT_SECRET`으로 `npm start`한 뒤 점검표 1번부터 4번까지 실행한다.
2. 서버를 끄고 다시 켜서 3번에서 만든 글이 상세 조회에 남는지 본다.
3. `PUBLIC_BASE_URL`을 메모장에 적고, 이 값이 쿠키의 보안 플래그와 어떻게 다른 역할인지 한 문장으로 쓴다.

## ⑦ ☐ 체크리스트

- ☐ 빌드 명령이 `npm ci`와 `node src/server.js`라는 것을 설명했다
- ☐ 도메인, 프록시, HTTPS, 앱 포트의 순서를 말했다
- ☐ 배포 환경의 `JWT_SECRET`, `DB_CLIENT`, DB 경로가 코드 밖에 있다
- ☐ 재시작 뒤에도 DB 파일이 남는 경로를 골랐다
- ☐ 배포 후 점검표의 건강 확인, 로그인, CRUD, 403, 404를 실행했다
- ☐ 기초 구간 study0~10이 한 게시판으로 이어진다는 것을 말할 수 있다

## ⑧ 다음 단계

기초만으로 게시판을 처음부터 조립하는 순서는 `studymidpoint.md`에 있다. 엔진을 바꾸고 외부 서비스를 더하는 일은 study11부터다.
