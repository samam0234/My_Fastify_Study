# study4. 라우팅과 요청 처리

## ① 목표

URL, 동적 경로, 쿼리, 없는 페이지, 오류 응답을 한 형식으로 맞춘다.

## ② 📖 이론

라우팅은 “이 메서드와 이 경로면 이 함수”를 정하는 일이다. `/items/:id`의 `:id`는 경로에서 뽑은 문자열이다. `/search?q=노트&page=2`의 `q`와 `page`는 쿼리다. 쿼리도 기본은 문자열이다. 숫자를 원하면 직접 검사한다.

요청은 대략 이 순서로 흐른다.

1. 연결을 받고 요청 아이디를 만든다.
2. 본문을 파싱한다. JSON이 아니면 라우트에 들어가지 않는다.
3. 라우트를 찾는다. 없으면 not-found 핸들러다.
4. 스키마로 매개변수, 쿼리, 본문을 검사한다.
5. `preValidation` 같은 훅을 지나 핸들러가 실행된다.
6. 핸들러가 던진 오류는 error handler가 상태 코드와 본문으로 바꾼다.

이 저장소의 오류 본문은 다음 한 가지다.

```json
{ "error": { "code": "NOT_FOUND", "message": "요청한 경로가 없습니다.", "requestId": "..." } }
```

`code`는 기계가 읽고, `message`는 사람이 읽고, `requestId`는 로그와 맞춘다. 응답 헤더 `x-request-id`에도 같은 값이 있다.

오류 핸들러를 라우트보다 먼저 등록한다. 나중에 등록하면 이미 만들어진 라우트 맥락은 기본 핸들러를 유지한다. 잘못된 JSON이 Fastify 기본 본문(`statusCode`, `message`)으로 새는 이유가 그것이다. not-found 핸들러는 정적 파일 플러그인보다 뒤에 둔다. 그래야 없는 파일이 우리 형식으로 바뀐다.

브라우저 주소창은 `Accept: text/html`을 보낸다. API 경로가 아니면 HTML 오류 페이지를 주고, `/api/`와 `/health`는 항상 JSON이다. 프론트의 경로와 백엔드의 경로를 맞춘다는 것은, 화면의 “글 상세”가 실제로는 `GET /api/posts/1`을 호출하고 사람이 보는 주소는 `/` 하나라는 뜻이다. 이 게시판은 서버 라우트로 화면을 여러 장 나누지 않는다.

비유하면 경로는 건물 호수, 쿼리는 방문 목적 쪽지, 오류 핸들러는 안내 데스크다. 호수가 없어도 안내 데스크의 문장은 항상 같은 양식이어야 한다.

## ③ 🛠️ 실기

전체 코드는 `examples/study4/server.js`다. `npm run example:routes`는 3003번이다.

```js
import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

function errorBody(request, code, message) {
  return { error: { code, message, requestId: request.id } }
}

export function buildExample(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500
    const code = error.code ?? 'INTERNAL'
    const message = statusCode >= 500 ? '서버 오류가 발생했습니다.' : error.message
    return reply.code(statusCode).send(errorBody(request, code, message))
  })
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send(errorBody(request, 'NOT_FOUND', '요청한 경로가 없습니다.'))
  })
  app.get('/items/:id', async (request) => {
    const id = request.params.id
    if (!/^[1-9]\d*$/.test(id)) {
      const error = new Error('번호 형식이 아닙니다')
      error.statusCode = 400
      error.code = 'BAD_REQUEST'
      throw error
    }
    if (id !== '1') {
      const error = new Error('항목이 없습니다')
      error.statusCode = 404
      error.code = 'NOT_FOUND'
      throw error
    }
    return { data: { id: 1, name: '공책' } }
  })
  app.get('/search', async (request) => {
    return { data: { q: request.query.q ?? null, page: request.query.page ?? '1' } }
  })
  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3003), host: '127.0.0.1' })
}
```

줄별 설명이다.

4–6. `errorBody`는 공통 껍질을 만든다. `request.id`가 요청 아이디다.
10–15. 오류 핸들러를 라우트보다 먼저 둔다. 상태 코드가 없으면 500이다. 500 이상이면 내부 문장을 숨기고 고정 문구만 보낸다. 4xx는 `error.message`를 그대로 쓴다.
16–18. 없는 경로는 404 `NOT_FOUND`다.
19–33. `:id`를 정규식으로 검사한다. `0`, 음수, 문자는 400 `BAD_REQUEST`다. 맞는 숫자인데 `1`이 아니면 404다. `1`만 `{ data: { id: 1, name: '공책' } }`를 돌려준다.
35–37. 쿼리 `q`가 없으면 `null`, `page`가 없으면 문자열 `'1'`이다. 숫자를 요구하기 전에 문자열이 온다는 것을 보여주는 라우트다.

게시판 본편은 이 예제를 `src/plugins/errors.js`로 키운다. 등록 위치는 `src/app.js`에서 `decorate('config')` 바로 다음이다.

```js
app.decorate('config', config)
installErrorHandler(app)
```

정적 파일 등록이 끝난 뒤에야 not-found를 깐다.

```js
await app.register(pageRoutes)
installNotFound(app)
```

`normalizeError`가 맞추는 코드는 다음과 같다.

| 상황 | HTTP | code |
| --- | --- | --- |
| 스키마 본문 실패 | 400 | `VALIDATION_ERROR` |
| 경로 매개변수 실패, 잘못된 JSON | 400 | `BAD_REQUEST` |
| 인증 없음, 자격 증명 실패 | 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 권한 없음, CSRF 불일치 | 403 | `FORBIDDEN` |
| 리소스 없음, 경로 없음 | 404 | `NOT_FOUND` |
| 이메일 중복 | 409 | `EMAIL_TAKEN` |
| 본문이 너무 큼 | 413 | `PAYLOAD_TOO_LARGE` |
| 로그인 횟수 초과 | 429 | `RATE_LIMITED` |
| 그 밖 | 500 | `INTERNAL` |

500 본문에는 스택과 `error.message`를 넣지 않는다. 로그에만 `request.log.error`로 남긴다.

목록 쿼리는 `parseListQuery`가 처리한다. `page` 기본 1, `limit` 기본 10, 50을 넘으면 50으로 자른다. 거절하지 않고 자르는 이유는 한도를 넘는 요청을 오류로 만들지 않기 위해서다. `sort`는 `createdAt`, `-createdAt`, `-commentCount`만 허용한다.

페이지 이동은 화면이 `history`를 바꾸지 않고 `public/js/main.js`가 목록과 상세 구역을 다시 그린다. 상세를 열면 `GET /api/posts/:id`를 호출한다. 주소창의 경로와 API 경로를 1:1로 두지 않아도, 호출 경로는 API 스펙과 같다.

## ④ 🔗 연동 포인트

예제의 `errorBody`가 본편 `{ error: { code, message, fields?, requestId } }`의 씨앗이다. study5의 검증 실패는 여기에 `fields`를 더한다. study6의 없는 글은 같은 404 형식을 재사용한다.

쿼리의 `page`, `limit`, `q`, `sort`는 공통 API 스펙 v1의 목록 계약이다. 프론트 페이지 번호는 이 쿼리로만 서버에 전달된다.

`x-request-id`는 브라우저 개발자도구와 서버 로그를 잇는다. 화면 오류 페이지를 봤을 때 그 아이디를 로그에서 찾으면 된다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 잘못된 JSON이 `{ statusCode, message }`로 나옴 | `setErrorHandler`가 라우트보다 늦음 | 핸들러를 라우트 등록 전에 둔다 |
| 없는 `/styles.css`가 JSON 404가 아님 | not-found를 정적 플러그인보다 먼저 등록 | `installNotFound`를 `pageRoutes` 뒤로 옮긴다 |
| `/items/0`이 404 | 정규식이 `0`을 숫자 형식으로 안 받음 | 1 이상의 정수만 자원 번호다. 0은 400이 맞다 |
| `page`가 숫자 1이 아니라 문자열 `"1"` | 쿼리는 문자열 | `parseListQuery`처럼 검사 후 `Number`로 바꾼다 |
| HTML 오류에 스크립트가 보임 | 메시지를 그대로 태그로 삽입 | `escapeHtml`로 코드, 메시지, 요청 아이디를 이스케이프한다 |
| 500 응답에 스택이 포함 | 핸들러가 `error.message`를 그대로 보냄 | 500은 고정 문구 `서버 오류가 발생했습니다.`만 보낸다 |

## ⑥ 직접 해보기

1. `GET /items/1`, `GET /items/2`, `GET /items/abc`, `GET /missing`의 상태 코드와 `error.code`를 적는다.
2. `GET /search?q=노트&page=2`에서 `q`와 `page`의 JSON 타입을 확인한다. `page`를 빼면 `'1'`이 되는지도 본다.
3. 브라우저로 예제에 없는 경로를 열어 보고, `curl -H "accept: application/json"`으로 같은 경로를 열어 본문 형식이 갈리는 조건을 정리한다. 본편은 `/api`만 JSON으로 고정한다.

## ⑦ ☐ 체크리스트

- ☐ 오류 핸들러로 HTTP · REST · API 설계 형식 맞추기
- ☐ 동적 경로 `:id`와 쿼리 `q`, `page`를 나눠 읽었다
- ☐ 없는 경로는 404 `NOT_FOUND`다
- ☐ 잘못된 번호는 400 `BAD_REQUEST`, 없는 자원은 404다
- ☐ 500 응답에 내부 문장과 스택을 넣지 않는다
- ☐ 오류 핸들러를 라우트보다 먼저 등록했다
- ☐ 화면 이동이 부르는 API 경로를 스펙의 경로와 맞춰 적었다

## ⑧ 다음 단계

경로가 오류를 같은 모양으로 돌려준다. study5에서는 그 모양 안에 입력 검증 실패와 중복 제출 방지를 넣는다.
