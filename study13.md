# study13. 외부 서비스 연동

## ① 목표

파일 업로드, 결제, 메일, 소셜 로그인을 Fastify 라우트로 붙이되, 비밀과 외부 호출은 환경변수가 있을 때만 일어나게 한다.

## ② 📖 이론

외부 서비스는 우리 프로세스가 아닌 시스템이다. 학습 중에는 그 시스템이 없어도 라우트의 상태 코드와 저장이 보여야 한다. 그래서 각 기능은 “로컬에서 끝나는 경로”와 “비밀이 있으면 밖으로 나가는 경로”를 나눈다.

- 파일은 우리 디스크다. `UPLOAD_DIR` 밖에 UUID 이름으로 저장하고, 원본 이름은 다운로드 헤더에만 쓴다.
- 결제는 상태만 저장하는 모의 주문이다. 웹훅은 `PAYMENT_WEBHOOK_SECRET`으로 HMAC을 검사한다. 비밀이 없으면 503이다.
- 메일은 항상 `OUTBOX_DIR`에 JSON을 쓴다. `SMTP_URL`이 있을 때만 nodemailer가 실제로 보낸다.
- 소셜 로그인은 프로세스 안의 가짜 인가 화면이다. 외부 신원 제공자에 연결하지 않는다. `state`와 `code`의 순서를 익히는 자리다.

결제와 메일을 진짜 회사의 API로 바꾸더라도 라우트가 보는 것은 상태 코드와 서명과 환경변수다. 키를 소스에 적지 않는다.

비유하면 업로드 폴더는 창고 뒤편, 웹훅 서명은 납품 확인 도장, 아웃박스는 아직 부치지 않은 편지 바구니, 가짜 OAuth는 창구 연습용 출입구다.

## ③ 🛠️ 실기

이 라우트들은 `APP_STAGE=final`일 때만 등록된다.

### 파일

`POST /api/uploads`는 로그인 필수, 파일 하나, 5MB 이하다. 허용 MIME은 `text/plain`, `text/markdown`, `image/png`, `image/jpeg`, `application/pdf`다. 빈 파일은 400, 한도 초과는 413 `PAYLOAD_TOO_LARGE`다.

저장 이름은 UUID다. `resolveStored`가 업로드 디렉터리 밖으로 나가는 경로를 거절한다. `GET /api/uploads/:id`는 소유자가 아니면 403이고, 있으면 원본 이름을 `filename*`로 붙여 스트림으로 보낸다. 파일은 `public/` 아래가 아니라서 URL을 추측해 바로 열 수 없다.

### 결제

`POST /api/payments`는 `{ amount, orderName }`을 받아 상태 `READY`와 201을 준다. 금액은 100 이상 10,000,000 이하다.

`POST /api/payments/:id/confirm`은 같은 사용자의 같은 금액만 `PAID`로 바꾼다. 금액이 다르면 400, 이미 `PAID`면 그 상태를 다시 준다.

`POST /api/payments/webhook`은 쿠키 로그인 예외다. 본문 원문 `request.rawBody`와 `x-payment-signature`를 `signBody`의 HMAC과 비교한다. 상태 값은 `PAID` 또는 `CANCELLED`만 받는다. 비밀이 없으면 503 `SERVICE_UNAVAILABLE`이다.

### 메일

`POST /api/mail`은 202 `{ data: { status: "queued" } }`를 바로 준다. 실제 파일 쓰기와 SMTP는 `app.queue`가 이어서 한다. `GET /api/mail`은 그 사용자의 저장된 메일 목록이다. SMTP가 비어 있어도 아웃박스 JSON은 생긴다.

### 소셜 로그인

`GET /api/auth/oauth/start?login_hint=이메일`이 `state`를 만들고 `/oauth/fake/authorize`로 302한다. 가짜 화면은 `redirect_uri`가 `PUBLIC_BASE_URL/api/auth/oauth/callback`일 때만 `code`를 만들어 콜백으로 보낸다. 콜백은 `state`를 한 번만 쓰고, 사용자가 없으면 무작위 비밀번호 해시로 만든 뒤 쿠키를 심고 302한다. 그 계정은 비밀번호 로그인을 일부러 맞출 수 없다. 없는 비밀번호와 같은 401 문장이 나온다.

`state`와 `code`는 프로세스 메모리다. 서버를 다시 띄우면 진행 중이던 로그인은 사라진다.

## ④ 🔗 연동 포인트

환경변수 `UPLOAD_DIR`, `OUTBOX_DIR`, `PAYMENT_WEBHOOK_SECRET`, `SMTP_URL`, `MAIL_FROM`, `PUBLIC_BASE_URL`이 이 단원의 연결 정보다. 비어 있는 결제 비밀과 SMTP는 “아직 계약 전”이라서 실패하거나 로컬 파일로 끝난다.

업로드 소유자 검사는 study7의 `request.authUser.id`를 재사용한다. 메일 큐는 study15의 백그라운드 작업이다. 웹훅의 원문 바이트는 study4에서 둔 JSON 파서가 `request.rawBody`에 남겨 둔 값이다. 파싱된 객체를 다시 `JSON.stringify`하면 공백이 달라져 서명이 깨진다.

화면 게시판은 이 네 기능을 버튼으로 넣지 않았다. `examples/board.http`와 `tests/final.test.js`가 API로 확인한다. 최종 서비스 문서에서 게시판 옆에 이 기능을 점검 항목으로 올린다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 업로드 400, 허용되지 않은 형식 | MIME이 목록 밖 | txt, md, png, jpg, pdf만 보낸다 |
| 413 | 5MB 초과 또는 앱 본문 한도 | 파일을 줄인다. 앱 JSON 한도는 2MB, 파일 한도는 5MB다 |
| 웹훅 503 | `PAYMENT_WEBHOOK_SECRET`이 빔 | 비밀을 넣거나, 학습 중에는 confirm 라우트로 상태를 바꾼다 |
| 웹훅 401 | 서명 대상이 원문과 다름 | `rawBody`와 같은 바이트로 HMAC을 만든다 |
| 메일이 202인데 받은편지함이 빔 | SMTP가 없고 아웃박스만 씀 | `data/outbox`의 JSON을 연다 |
| OAuth가 400 state | 새로고침으로 state를 두 번 씀 | start부터 다시 시작한다. 메모리는 일회용이다 |
| 소셜 계정으로 비밀번호 로그인 실패 | 무작위 해시라 맞는 비밀번호가 없음 | 쿠키 흐름으로만 로그인한다 |

## ⑥ 직접 해보기

1. 텍스트 파일을 `POST /api/uploads`로 올리고, 같은 사용자와 다른 사용자로 `GET /api/uploads/:id`의 200과 403을 비교한다.
2. 결제를 만들고 금액을 틀리게 confirm해 400을 본 뒤, 맞는 금액으로 `PAID`를 확인한다.
3. `POST /api/mail` 뒤 `data/outbox`에 JSON이 생겼는지 보고, `SMTP_URL`을 비운 이유가 무엇인지 한 줄로 적는다.

## ⑦ ☐ 체크리스트

- ☐ 업로드는 허용 MIME, 크기, 소유자, 디렉터리 탈출을 검사한다
- ☐ 결제는 `READY`, `PAID`, `CANCELLED`와 서명 웹훅을 구분한다
- ☐ 메일은 202로 받고 아웃박스에 남으며, SMTP는 있을 때만 보낸다
- ☐ OAuth는 로컬 가짜 제공자로 `state`와 `code`를 한 번만 쓴다
- ☐ 비밀과 외부 주소는 환경변수다

## ⑧ 다음 단계

바깥 기능의 상태 코드가 늘었다. study14에서는 그 경로를 OpenAPI로 적고, 페이지네이션과 오류 규칙을 한 문서 형식으로 모은다.
