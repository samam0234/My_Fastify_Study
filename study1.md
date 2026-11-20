# study1. Hello World와 기본 문법

## ① 목표

Fastify로 첫 HTML과 첫 JSON을 돌려주고, 템플릿 문자열로 값을 끼워 넣는 문법을 확인한다.

## ② 📖 이론

첫 응답은 프레임워크가 살아 있다는 증거다. 브라우저가 `GET /`를 보내면 라우트 함수가 실행되고, `reply`가 상태 코드와 본문을 소켓에 쓴다.

이 단계의 문법은 세 가지다.

- `app.get(경로, 핸들러)`는 GET 라우트를 등록한다.
- 핸들러의 `async`는 프라미스가 끝나면 그 값을 응답으로 보낸다. 객체를 반환하면 JSON이 된다.
- 백틱 문자열 `` `${name}` ``은 값을 문장 안에 넣는다. HTML을 만들 때 이 방식을 쓴다.

왜 `reply.type`을 쓰는가. 객체를 반환하면 Fastify가 `application/json`을 붙인다. HTML 문자열은 그대로 두면 브라우저가 JSON이나 텍스트로 오해할 수 있어 `text/html; charset=utf-8`을 명시한다.

비유하면 라우트는 창구 번호다. `/`는 안내문, `/api/hello`는 기계가 읽는 쪽지다. 같은 서버가 두 창구를 연다.

개발 중에는 `node --watch`가 파일을 저장할 때마다 프로세스를 바꾼다. 브라우저는 스스로 다시 그리지 않으니 새로고침하고, 개발자도구 Network에서 상태 코드와 `content-type`을 본다.

## ③ 🛠️ 실기

예제 전체는 `examples/study1/server.js`다. 실행은 `npm run example:hello`이고 포트는 3000이다. 게시판 서버가 이미 3000을 쓰고 있으면 그 서버를 끄거나 `PORT=3010`처럼 포트를 바꾼다.

```js
import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

export function buildExample(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  app.get('/', async (request, reply) => {
    const name = 'Fastify'
    const html = `<!doctype html><meta charset="utf-8"><title>안녕</title><h1>${name}에 오신 것을 환영합니다</h1><p>이 문장은 템플릿 문자열로 이름을 끼워 넣었습니다.</p>`
    return reply.type('text/html; charset=utf-8').send(html)
  })
  app.get('/api/hello', async () => {
    return { message: '안녕하세요, Fastify' }
  })
  app.get('/api/hello/:name', async (request) => {
    const name = request.params.name
    return { message: `${name}님, 반가워요` }
  })
  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3000), host: '127.0.0.1' })
}
```

줄별 설명이다.

1. `fastify` 패키지의 기본보내기를 가져온다. `Fastify()`를 호출하면 앱이 생긴다.
2. `pathToFileURL`은 이 파일을 직접 실행했는지 판별할 때 경로를 URL로 맞춘다.
4. `buildExample`은 테스트와 실행이 같이 쓰는 공장 함수다. 옵션을 비우면 빈 객체가 된다.
5. 로거 기본값은 꺼져 있다. `??`는 `null`과 `undefined`만 오른쪽을 쓴다. `false`를 넘기면 그 값이 유지된다.
6. `GET /` 핸들러다. `request`는 이번 예제에서 안 읽고, `reply`로 타입을 바꾼다.
7. `name`은 템플릿에 넣을 상수다.
8. HTML 한 줄이다. `${name}`이 `Fastify`로 바뀐 뒤 문자열이 된다.
9. `type`으로 MIME을 정하고 `send`로 본문을 끝낸다. `return`이 있어야 핸들러가 그 프라미스를 기다린다.
11. `GET /api/hello`는 `reply` 없이 객체를 반환한다. Fastify가 JSON으로 직렬화한다.
14. `:name`은 경로 매개변수다. `/api/hello/mina`이면 `request.params.name`이 `mina`다.
15. 매개변수는 항상 문자열이다.
16. 다시 템플릿 문자열로 문장을 만든다.
18. 앱을 반환해 테스트가 `inject`로 요청을 넣게 한다.
21. `process.argv[1]`은 노드에 넘긴 스크립트 경로다. `import.meta.url`과 같으면 직접 실행이다. 테스트가 import만 하면 여기가 거짓이 되어 `listen`하지 않는다.
23. 직접 실행일 때만 로거를 켜고 3000번, 또는 `PORT`에 묶는다. `host`를 `127.0.0.1`로 두어 이 컴퓨터 밖으로 열지 않는다.

확인한다.

```text
npm run example:hello
```

브라우저에서 `http://127.0.0.1:3000/`을 연다. 개발자도구 Network에서 문서 요청의 상태가 200이고 형식이 `text/html`인지 본다. 이어서 주소창에 `/api/hello`와 `/api/hello/mina`를 넣거나 아래를 실행한다.

```text
curl http://127.0.0.1:3000/api/hello
curl http://127.0.0.1:3000/api/hello/mina
```

`server.js`의 문장 하나를 고치고 저장하면 `--watch` 로그에 재시작이 보인다. 브라우저를 새로고침해야 바뀐 HTML이 나온다.

## ④ 🔗 연동 포인트

이 예제의 `buildExample`과 “직접 실행일 때만 listen” 패턴을 study2부터 study5까지 그대로 쓴다. 테스트는 앱을 띄우지 않고 `inject`로 같은 함수를 호출한다.

게시판 본편의 `npm run dev`도 같은 `--watch`다. study1의 HTML은 `public/index.html`로, JSON은 `/health`와 `/api/*`로 이어진다. 화면과 API의 경로를 처음부터 나눈 이유가 여기 있다. `/`는 사람이 읽고, `/api`는 프로그램이 읽는다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| HTML이 한 줄 글자로 보임 | `content-type`이 `text/plain` | `reply.type('text/html; charset=utf-8')`를 붙인다 |
| 한글이 깨짐 | charset 누락 | MIME에 `charset=utf-8`을 넣는다 |
| `listen EADDRINUSE :::3000` | 게시판 서버나 이전 예제가 포트를 점유 | 그 프로세스를 끄거나 `PORT`를 바꾼다 |
| 저장했는데 화면이 그대로 | 서버만 재시작되고 브라우저는 옛 문서를 씀 | 새로고침하고 Network에서 캐시가 아닌 200을 확인한다 |
| 테스트 중에 포트가 열림 | `if (direct)` 조건을 빼서 import만 해도 listen | 직접 실행 가드를 유지한다 |
| `:name`이 비어 있음 | 경로를 `/api/hello/`처럼 슬래시만 둠 | 값이 있는 경로로 요청한다 |

## ⑥ 직접 해보기

1. `/`의 제목을 바꾸고 저장한 뒤, 개발자도구에서 새 문서 요청의 응답 본문을 확인한다.
2. `GET /api/hello/:name`에 본인 이름을 넣어 JSON의 `message`가 바뀌는지 본다.
3. 핸들러에서 객체를 `reply.send` 하지 않고 `return`만 했을 때와, HTML을 `return`만 했을 때의 `content-type` 차이를 Network에서 비교한다.

## ⑦ ☐ 체크리스트

- ☐ `npm run example:hello`로 예제 서버를 띄웠다
- ☐ `GET /`가 HTML이고 상태 200이다
- ☐ 템플릿 문자열 `${name}`이 화면에 값으로 보인다
- ☐ `GET /api/hello`가 `{"message":"안녕하세요, Fastify"}`를 돌려준다
- ☐ `GET /api/hello/:name`의 경로 매개변수가 문장에 들어간다
- ☐ `node --watch` 저장 후 재시작을 로그로 확인했다
- ☐ 브라우저 개발자도구 Network에서 상태 코드와 `content-type`을 읽었다

## ⑧ 다음 단계

한 파일 안의 라우트는 동작한다. study2에서는 그 라우트를 플러그인으로 나누고, 플러그인끼리 함수를 어떻게 넘겨 받는지 만든다.
