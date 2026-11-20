# study2. 핵심 구조

## ① 목표

Fastify의 기본 단위인 앱, 플러그인, 라우트를 나누고, 데코레이터와 함수 호출로 서로 데이터를 주고받는다.

## ② 📖 이론

Fastify 앱은 빈 서버다. `register`로 플러그인을 끼우면 그 플러그인 안에 라우트와 장식을 둔다. 장식(`decorate`)은 앱에 이름 달린 값을 붙이는 일이다. `fastify.now`처럼 호출한다.

캡슐화가 핵심이다. 플러그인 안에서 `decorate`한 값은 그 플러그인과 그 자식만 본다. 부모 앱과 형제 플러그인은 못 본다. 여러 라우트가 같이 써야 하는 시계, 데이터베이스, 설정은 `fastify-plugin`(`fp`)으로 감싸 부모에게 흘려보낸다.

왜 이렇게 나누나. 한 파일에 라우트가 쌓이면 인증과 글 쓰기가 서로의 변수를 만진다. 플러그인 경계가 있으면 “이 이름은 여기서만 산다”가 코드로 보장된다.

비유하면 플러그인은 칸막이가 있는 방이다. `fp`는 칸막이에 문을 달아 복도(부모 앱)에서도 설비 이름을 보게 하는 표시다. 라우트는 그 방 안의 창구다.

단위끼리 데이터를 주고받는 방법은 이 프레임워크에서 다음 세 가지다.

- 함수 호출. `formatMessage(name)`처럼 순수 함수를 불러 문자열을 만든다.
- 데코레이터. `fastify.now()`처럼 플러그인이 공개한 함수를 라우트가 호출한다.
- 요청 객체. `request.params`, 나중에는 `request.authUser`처럼 훅이 요청에 값을 붙이고 라우트가 읽는다.

부모 스코프의 `app.hasDecorator`로 자식 플러그인 안 장식이 보이는지 확인하면, 캡슐화가 실제로 막는지 바로 알 수 있다.

## ③ 🛠️ 실기

전체 코드는 `examples/study2/server.js`다. `npm run example:plugins`는 3001번 포트에 연다.

```js
import Fastify from 'fastify'
import fp from 'fastify-plugin'
import { pathToFileURL } from 'node:url'

export function formatMessage(name) {
  return `${name}님에게 플러그인이 응답합니다`
}

async function clockPlugin(fastify) {
  fastify.decorate('now', () => new Date().toISOString())
}

export const sharedClock = fp(clockPlugin, { name: 'shared-clock' })

export function buildExample(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  app.register(sharedClock)
  app.register(async function messageRoutes(fastify) {
    fastify.get('/message/:name', async (request) => {
      return { text: formatMessage(request.params.name), at: fastify.now() }
    })
  })
  return app
}

export function buildIsolated() {
  const app = Fastify({ logger: false })
  app.register(async function hidden(fastify) {
    fastify.decorate('secretNote', '이 값은 플러그인 안에만 있습니다')
  })
  app.get('/note', async () => ({ shared: app.hasDecorator('secretNote') }))
  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3001), host: '127.0.0.1' })
}
```

줄별 설명이다.

1. Fastify 생성자를 가져온다.
2. `fp`는 플러그인의 캡슐화를 깨고 부모에 장식을 노출한다.
3. 직접 실행 여부를 URL로 비교하기 위한 도구다.
5–7. `formatMessage`는 앱에 기대지 않는 순수 함수다. 라우트는 이 함수를 호출해 문장을 만든다. 테스트도 함수만 따로 부를 수 있다.
9–11. `clockPlugin`은 받은 `fastify`에 `now` 함수를 장식한다. 호출 시점의 ISO 시각을 돌려준다.
13. `fp(..., { name: 'shared-clock' })`로 감싼다. 이름이 있으면 의존 관계를 문서로 남길 수 있다. 감싸지 않으면 `messageRoutes` 형제에서 `now`를 못 본다.
15–16. 예제 앱을 만들고 공유 시계를 먼저 등록한다. 등록 순서가 중요하다. 라우트보다 먼저 있어야 핸들러가 실행될 때 `now`가 있다.
17–21. 두 번째 플러그인에만 라우트를 둔다. `request.params.name`을 `formatMessage`에 넘기고, 같은 플러그인 스코프의 `fastify.now()`로 시각을 붙인다. 부모가 `fp`로 시계를 노출했기 때문에 이 자식이 `now`를 본다.
26–32. `buildIsolated`는 일부러 `fp`를 쓰지 않는다. `secretNote`는 `hidden` 안에만 있다. 부모 라우트 `GET /note`의 `app.hasDecorator('secretNote')`는 `false`다.
35–38. 이 파일을 직접 실행할 때만 3001번에 연다. 테스트 import는 listen하지 않는다.

확인한다.

```text
npm run example:plugins
curl http://127.0.0.1:3001/message/mina
```

`text`에 이름이 들어가고 `at`에 시각이 있다.

게시판 본편도 같은 구조다. `src/app.js`가 앱이고, `src/plugins/db.js`와 `src/plugins/auth.js`는 `fp`로 감싼 공유 설비다. `src/routes/posts.js`의 `postRoutes`는 라우트 플러그인이다. 라우트는 `app.repo`, `app.config`, `request.authUser`를 읽는다. 이것이 예제의 `fastify.now`와 같은 자리다.

## ④ 🔗 연동 포인트

`sharedClock`을 부모에 노출하는 방식이 study6의 `app.repo`로 이어진다. 데이터베이스 플러그인이 `decorate('repo', ...)`를 하고 `fp`로 감싸야 글 라우트와 댓글 라우트가 같은 저장소를 부른다.

`request`에 값을 붙이는 방식은 study7에서 `request.authUser`가 된다. 훅이 요청 초에 토큰을 읽고, 라우트는 그 객체의 `id`만 본다.

`formatMessage`처럼 입출력만 있는 함수는 `src/lib/`로 올라간다. study8에서 폴더를 정리할 때 이 경계를 기준으로 파일을 나눈다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `fastify.now is not a function` | 시계 플러그인을 `fp`로 감싸지 않았거나 라우트보다 나중에 등록 | `fp`로 감싸고 `register` 순서를 시계 우선으로 둔다 |
| `FST_ERR_DEC_ALREADY_PRESENT` | 같은 이름을 두 번 `decorate` | 이름을 하나로 유지하거나 테스트마다 새 앱을 만든다 |
| 부모 라우트가 자식 장식을 못 봄 | 캡슐화가 정상 동작 | 공유할 것만 `fp`로 감싼다. 못 보는 것이 맞을 때가 있다 |
| 플러그인 의존 오류 | 이름의 플러그인을 다른 컨텍스트에 등록 | `@fastify/swagger`처럼 UI가 찾는 플러그인은 같은 스코프에 `fp`로 올린다. 이 저장소의 `src/plugins/docs.js`가 그렇게 한다 |
| 3001이 이미 사용 중 | 예제를 두 번 실행 | 이전 프로세스를 종료한다 |

## ⑥ 직접 해보기

1. `GET /message/자신의이름`을 호출해 `text`와 `at`이 같이 오는지 본다.
2. `sharedClock`의 `fp`를 잠시 빼고 같은 요청을 보낸다. `now`를 못 찾는 오류를 확인한 뒤 되돌린다.
3. `buildIsolated`의 `GET /note`가 `{"shared":false}`인지 테스트나 `inject`로 확인한다. 장식을 부모에서 `decorate`하면 `true`가 되는지도 비교한다.

## ⑦ ☐ 체크리스트

- ☐ Fastify 프로젝트, 라우트와 플러그인
- ☐ 앱, 플러그인, 라우트의 역할을 한 문장씩 말할 수 있다
- ☐ `register`로 라우트 플러그인을 나눠 등록했다
- ☐ `decorate`로 `now` 같은 함수를 붙였다
- ☐ `fastify-plugin` 없이 만든 장식은 부모에서 보이지 않는다는 것을 확인했다
- ☐ 순수 함수 호출과 `request.params`로 라우트에 값을 넘겼다
- ☐ 공유 설비는 라우트보다 먼저 `register`한다는 순서를 지켰다

## ⑧ 다음 단계

구조가 나뉘면 그 안에 데이터를 둘 자리가 필요하다. study3에서는 메모를 파일에 저장하고, 화면 입력은 브라우저 `localStorage`에 묶는다.
