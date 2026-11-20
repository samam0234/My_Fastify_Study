# study9. 테스트와 디버깅

## ① 목표

단위 테스트와 HTTP 요청 테스트를 작성하고, 요청 아이디와 로그로 실패를 찾으며, 데이터베이스와 외부 API를 테스트 대역으로 바꾼다.

## ② 📖 이론

테스트는 서버를 포트에 올리지 않고도 라우트를 호출할 수 있다. Fastify `app.inject`는 소켓 없이 메서드, URL, 헤더, 본문을 넣고 응답을 돌려준다. `node:test`와 `node:assert/strict`만 쓴다. 별도 테스트 러너는 없다. 명령은 `npm test`다.

단위 테스트는 앱을 만들지 않는다. `hashPassword`, `parseListQuery`, `signBody`처럼 입출력만 있는 함수를 직접 부른다. 요청 테스트는 `createTestApp()`으로 `buildApp`을 만들고 `inject`한다.

대역은 두 종류다.

- 데이터베이스 대역. `dbClient: 'sqlite'`, `sqlitePath: ':memory:'`, `skipEnvFile: true`다. 개발자 `.env`의 Postgres 주소가 테스트를 타지 않는다. 저장소 인터페이스는 진짜와 같다. 쿼리 실수까지 드러난다.
- 외부 API 대역. 메일과 결제는 비밀이 없으면 로컬 동작으로 남고, AI는 `tests/final.test.js`가 `127.0.0.1`에 작은 HTTP 서버를 띄워 `AI_BASE_URL`로 넘긴다. 라우트는 URL만 알 뿐 테스트 서버인지 구분하지 않는다.

디버깅 도구는 세 가지다.

- 응답 헤더 `x-request-id`와 오류 본문의 `requestId`.
- pino 로그. `src/server.js`가 `authorization`과 `cookie`를 `[redacted]`로 가린다. 인증 플러그인의 `onResponse`가 상태 코드와 `userId`를 남긴다.
- `node --inspect src/server.js`로 중단점을 건다. 테스트 중에는 `inject`가 같은 프로세스라서 핸들러에 `debugger`를 두고 `node --inspect --test tests/api.test.js`로 붙는다.

비유하면 `inject`는 창구 뒤의 모의 고객이고, 메모리 SQLite는 연습용 창고다. 요청 아이디는 영수증 번호라서 고객이 본 오류와 서버 로그를 같은 번호로 찾는다.

## ③ 🛠️ 실기

테스트 헬퍼의 핵심이다.

```js
export async function createTestApp(overrides = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'fastify-study-'))
  const app = await buildApp({
    skipEnvFile: true,
    nodeEnv: 'test',
    stage: 'final',
    dbClient: 'sqlite',
    sqlitePath: ':memory:',
    jwtSecret: 'test-secret-please-change',
    logger: false,
    cookieSecure: false,
    loginRateMax: 1000,
    paymentWebhookSecret: 'whsec-test',
    enableDebugRoutes: true,
    ...overrides
  })
  app.addHook('onClose', async () => {
    await rm(dir, { recursive: true, force: true })
  })
  return app
}
```

1. 임시 폴더는 업로드와 메일 보관용이다. 데이터베이스는 메모리다.
2. `stage: 'final'`이 기본이라 심화 라우트 테스트가 한 앱에서 돈다. 기초만 보려면 `{ stage: 'basic', sqlitePath }`를 넘긴다.
3. 로거는 꺼 두어 테스트 출력이 조용하다. 실패를 볼 때만 테스트에서 `logger: true`를 넘긴다.
4. `loginRateMax: 1000`은 정상 로그인 테스트가 429로 끊기지 않게 한다. 제한 테스트만 2로 낮춘다.

요청 테스트의 시작 부분이다.

```js
test('health, validation, auth, posts, and comments follow API v1', async () => {
  const app = await createTestApp()
  const health = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'req-12345678' } })
  assert.equal(health.statusCode, 200)
  assert.deepEqual(health.json(), { status: 'ok' })
  assert.equal(health.headers['x-request-id'], 'req-12345678')
  await app.close()
})
```

1. `x-request-id`가 형식(8~80자의 영문, 숫자, `.`, `_`, `:`, `-`)에 맞으면 그 값을 그대로 쓴다. 아니면 서버가 UUID를 만든다.
2. `health.json()`은 본문을 객체로 파싱한다.
3. `app.close()`는 DB와 임시 폴더를 닫는다. 빠지면 파일 잠금이 다음 테스트까지 남는다.

단위 테스트는 해시가 맞는지, 틀린 비밀번호가 거절되는지, `limit=80`이 50으로 잘리는지, 빈 발췌가 “문서에서 찾을 수 없습니다.”인지를 본다.

로그를 보는 법이다.

```text
npm run dev
```

요청을 보내면 한 줄에 상태 코드와 `userId`가 남는다. 500은 `서버 오류` 메시지와 함께 스택이 로그에만 있고 응답에는 `INTERNAL`만 있다. 화면이 HTML 오류를 보여 주면 그 페이지의 `requestId`를 터미널에서 찾는다.

자주 나는 오류 열 가지다.

| # | 증상 | 원인 | 해결 |
| --- | --- | --- | --- |
| 1 | 기동 직후 종료, Node 22.5 문구 | 런타임이 오래됨 | Node를 올리고 `node -v`를 확인한다 |
| 2 | `JWT_SECRET` 길이 오류 | 비밀이 16자 미만 | `.env`를 고치고 프로세스를 다시 띄운다 |
| 3 | `EADDRINUSE` | 포트 점유 | 이전 `node`를 끄거나 `PORT`를 바꾼다 |
| 4 | 잘못된 JSON이 Fastify 기본 본문 | 오류 핸들러가 라우트보다 늦음 | `installErrorHandler`를 라우트 등록 전에 둔다 |
| 5 | 토큰 없이 빈 제목을 보냈더니 400 | 인증 훅이 스키마보다 뒤 | `preValidation: requireAuth`를 유지한다. 기대한 코드는 401이다 |
| 6 | 쿠키 로그인 후 쓰기가 403 | CSRF 헤더 누락 | `x-csrf-token`에 `csrf_token` 쿠키 값을 넣는다 |
| 7 | 로그인 200인데 브라우저만 401 | `COOKIE_SECURE=true`와 http | 로컬은 `false`로 둔다 |
| 8 | `FST_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED` | Swagger UI와 스펙 플러그인의 스코프가 다름 | 스펙 플러그인을 `fastify-plugin`으로 감싼다 |
| 9 | 정적 `GET /`가 500 `setHeader is not a function` | `@fastify/static`의 `setHeaders` 첫 인자가 reply | `reply.header`로 캐시 헤더를 넣는다 |
| 10 | Windows에서 테스트 끝 `EBUSY` | SQLite 파일을 연 자식 프로세스가 아직 살아 있음 | 프로세스가 끝난 뒤 지우고, 잠기면 짧게 재시도한다 |

## ④ 🔗 연동 포인트

테스트의 메모리 SQLite는 운영 파일 DB와 같은 `repo` 메서드를 탄다. 목록 쿼리와 404가 테스트에서 통과하면 같은 코드가 `./data/board.db`에서도 그 계약을 지킨다.

외부 AI는 `AI_BASE_URL`이 비어 있으면 호출하지 않는다. 테스트가 그 변수만 로컬 서버로 바꿔 요약 문장이 모델 응답으로 바뀌는지 본다. 메일 SMTP와 결제 비밀도 같은 방식이다. 값이 없으면 네트워크를 열지 않는다.

`enableDebugRoutes`는 테스트에서만 참이다. `GET /__test/boom`이 던진 `secret stack` 문자열이 응답 본문에 없어야 한다. 운영 `.env`의 `ENABLE_DEBUG_ROUTES`는 `false`다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 테스트가 개발 DB에 글을 씀 | 헬퍼가 `.env`를 읽음 | `skipEnvFile: true`를 유지한다 |
| `inject` 없이 `fetch('http://127...')`만 사용 | 서버를 listen하지 않음 | 앱 테스트는 `inject`를 쓴다. 웹소켓만 실제 포트를 연다 |
| 비밀번호 테스트가 느림 | scrypt 비용이 의도적으로 큼 | 단위 테스트 수를 늘리기보다 기존 해시 테스트를 재사용한다 |
| 로그에 토큰이 찍힘 | 헤더를 `console.log` | 서버 로거는 redact를 쓰고, 테스트는 상태 코드만 단언한다 |
| 실패 위치가 한 테스트에 몰림 | `api.test.js`가 시나리오 하나 | 실패한 `assert` 줄의 요청부터 상태 코드와 `error.code`를 읽는다 |

## ⑥ 직접 해보기

1. `npm test`를 실행해 통과 개수를 적는다.
2. `tests/api.test.js`의 건강 확인에서 기대한 상태를 201로 바꾼 뒤 실패 메시지를 읽고 되돌린다.
3. `createTestApp({ logger: true })`로 한 요청을 보내 `onResponse` 로그에 상태 코드가 보이는지 확인한다. 확인 뒤에는 기본값 `false`를 유지한다.

## ⑦ ☐ 체크리스트

- ☐ `npm test`가 `node:test`로 단위 테스트와 요청 테스트를 돌린다
- ☐ 요청 테스트가 `inject`를 쓰고 포트를 점유하지 않는다
- ☐ 테스트 DB가 메모리 SQLite이고 `.env`를 읽지 않는다
- ☐ 외부 AI를 로컬 HTTP 서버로 바꿔 연결할 수 있다
- ☐ `x-request-id`로 응답과 로그를 맞출 수 있다
- ☐ 500 응답 본문에 스택이 없고 로그에만 남는다
- ☐ 자주 나는 오류 10개의 원인과 고치는 위치를 말할 수 있다

## ⑧ 다음 단계

실패를 테스트로 고정했다. study10에서는 이 프로세스를 다른 컴퓨터에서 어떻게 띄우고, 기초 구간에서 무엇을 지었는지 정리한다.
