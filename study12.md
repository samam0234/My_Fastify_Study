# study12. 프론트와 UI 연동

## ① 목표

Fastify가 제공하는 같은 출처 화면에서 상태 모듈, 폼 모듈, API 모듈을 나눠 게시판을 조작한다.

## ② 📖 이론

이 저장소의 화면은 `public/`의 HTML과 브라우저 모듈이다. Fastify `@fastify/static`이 `/`, `/styles.css`, `/js/*.js`를 준다. 상태와 폼을 별도 프레임워크 패키지로 가져오지 않고, 같은 역할을 하는 작은 모듈 두 개로 둔다.

- `public/js/state.js`는 상태 모듈이다. `get`, `set`, `subscribe`만 있다.
- `public/js/form.js`는 폼 모듈이다. 보내기 전 검사와 상태 코드에 따른 문장을 만든다.
- `public/js/api.js`는 서버와의 경계다. 쿠키, CSRF, 멱등 키를 붙인다.
- `public/js/main.js`는 셋을 묶어 버튼을 그린다.

왜 이렇게 나누나. 상태 변경, 입력 검사, HTTP가 한 파일에 있으면 오류 문장을 고칠 때 렌더가 깨진다. 모듈이 나뉘면 `messageForStatus`만 테스트해도 400과 422의 화면 문장을 설명할 수 있다.

서버는 화면 상태를 모른다. 화면은 SQL을 모른다. 둘은 JSON과 상태 코드로만 만난다.

바인딩은 `subscribe`다. `set`이 호출되면 구독자가 인증 구역과 목록 구역을 다시 그린다. 초안 입력은 그 상태와 별도로 `localStorage` 키 `fastify-board-draft`에 남는다.

비유하면 상태 모듈은 카운터 유리창, 폼 모듈은 접수 도장, API 모듈은 창구 직원이다. Fastify는 그 직원을 불러 주는 건물이다.

## ③ 🛠️ 실기

정적 파일 등록 `src/routes/pages.js` 전체다.

```js
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'

const publicRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public')

export async function pageRoutes(app) {
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: '/',
    setHeaders(reply, filePath) {
      if (filePath.endsWith('.html')) reply.header('cache-control', 'no-cache')
    }
  })
}
```

1. `publicRoot`는 `src/routes`에서 두 단계 위인 `public/`이다.
2. HTML만 `cache-control: no-cache`다. 스크립트를 고친 뒤 브라우저가 옛 `index.html`을 계속 보지 않게 한다.
3. `setHeaders`의 첫 인자는 reply다. Node의 `response.setHeader`가 아니다.

`index.html`은 `#auth`, `#board`, `#notice`만 비워 둔다. 모듈 스크립트 `/js/main.js`가 채운다. CSS는 `/styles.css`다.

폼 모듈의 상태 분기 전체다.

```js
export function messageForStatus(status, data) {
  if (status === 200 || status === 201 || status === 202 || status === 204) return ''
  if (status === 400 || status === 422) {
    const fields = data?.error?.fields
    if (fields) return Object.entries(fields).map(([key, list]) => `${key}: ${list.join(' ')}`).join('\n')
  }
  return data?.error?.message ?? `요청이 실패했습니다. (${status})`
}
```

1. 성공 코드는 빈 문자열이다. 호출자가 목록을 다시 읽는다.
2. 400과 422는 같은 칸 오류 문장이다. 서버는 400만 보낸다.
3. 그 외에는 `error.message`를 보여 준다. 본문이 없으면 상태 코드만 남긴다.

`clientSignupErrors`와 `clientPostErrors`는 네트워크 전에 빈 칸을 막는다. 통과해도 서버 스키마가 다시 검사한다.

상태 모듈은 study3에 적은 `createStore`다. `main.js`는 저장소가 바뀔 때마다 화면을 통째로 다시 그린다. 그래서 다른 입력창에 쓰던 글자가 지워질 수 있다. 초안 키를 `localStorage`에 두는 이유가 그 한계를 줄이기 위해서다.

API 모듈은 `credentials: 'include'`로 쿠키를 보내고, GET이 아닌 요청에 `x-csrf-token`을 붙이며, 글 작성에는 `idempotency-key`를 넣는다.

CSP는 `script-src 'self'`다. 인라인 이벤트 속성 대신 모듈 파일의 `addEventListener`를 쓴다. study1 예제의 인라인 스크립트는 예제 서버 한정이고, 게시판 화면은 외부 파일만 로드한다.

## ④ 🔗 연동 포인트

화면의 목록 요청은 `GET /api/posts`다. 응답 `data`를 상태의 글 배열로 `set`하고, `meta.page`와 `meta.totalPages`가 페이지 버튼이 된다. 상세는 `GET /api/posts/:id`다.

로그인 성공은 쿠키가 생기므로 상태가 “사용자 있음”으로 바뀌고 `#board`가 보인다. 401이면 폼 모듈의 분기가 로그인 구역으로 되돌린다.

study5의 검증 문장은 서버 `fields`가 화면 문장의 출처다. 클라이언트 검사는 왕복을 줄이는 보조다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 화면이 비어 있음 | `/js/main.js`가 404거나 모듈 오류 | 개발자도구 Console과 Network를 같이 본다 |
| 글을 쓰면 403 | CSRF 헤더 누락 | `api.js`가 쿠키 `csrf_token`을 읽는지 확인한다 |
| 저장했는데 HTML이 옛 버전 | 브라우저 캐시 | HTML의 `no-cache`를 유지하고 새로고침한다 |
| 입력 중이던 칸이 사라짐 | 구독자가 구역 전체를 다시 그림 | 초안은 `fastify-board-draft`에 남긴다. 다시 그리기 범위를 줄이는 것은 이후 개선이다 |
| CSP 오류로 스크립트가 막힘 | 인라인 스크립트를 추가함 | 동작을 `/js` 파일로 옮긴다 |

## ⑥ 직접 해보기

1. 브라우저에서 회원가입과 글 작성을 하고, Network에서 `POST /api/posts`의 쿠키와 `x-csrf-token`이 같이 가는지 본다.
2. 제목을 비운 채 저장해 `messageForStatus`가 필드 문장을 만드는지 화면에서 확인한다.
3. Application 탭에서 `fastify-board-draft`가 서버 글과 따로 저장되는지 새로고침으로 본다.

## ⑦ ☐ 체크리스트

- ☐ Fastify가 `public/`을 같은 출처로 제공한다
- ☐ 상태 모듈과 폼 모듈과 API 모듈의 파일 역할을 구분했다
- ☐ 200번대와 400, 422의 화면 분기를 설명했다
- ☐ 클라이언트 검사 뒤에도 서버 스키마가 다시 검사한다
- ☐ 화면이 목록 `meta`와 상세 경로를 API와 맞춰 호출한다

## ⑧ 다음 단계

화면이 API에 붙었다. study13에서는 그 API 옆에 파일, 결제, 메일, 소셜 로그인 자리를 같은 서버에 붙인다.
