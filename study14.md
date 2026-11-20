# study14. API 설계

## ① 목표

게시판 API를 REST 자원으로 정리하고, OpenAPI 화면으로 문서를 보며, 버전, 페이지네이션, 오류 규칙을 한 형식으로 고정한다.

## ② 📖 이론

REST에서 경로 이름은 동사보다 자원이다. 글은 `/api/posts`, 그 글의 댓글은 `/api/posts/:id/comments`, 댓글 자체는 `/api/comments/:id`다. 만들기는 POST, 일부 수정은 PATCH, 삭제는 DELETE, 조회는 GET이다.

버전은 URL의 `/v1` 대신 OpenAPI `info.version` `1.0.0`과 이 저장소가 따르는 공통 API 스펙 v1에 있다. 경로를 나중에 깨야 하면 그때 `/api` 앞에 버전 세그먼트를 더하고, 응답의 `error.code`는 유지한다. 코드를 바꾸지 않고 문장만 바꾸는 것은 호환 수정이다. 필드를 빼거나 상태 코드를 바꾸는 것은 호환을 깨는 수정이다.

페이지네이션은 커서 없이 `page`와 `limit`다. 기본 1과 10, `limit` 상한 50, `meta.total`과 `meta.totalPages`를 같이 준다. `q`가 없으면 `null`이다. 정렬 화이트리스트는 `createdAt`, `-createdAt`, `-commentCount`다.

오류 규칙은 study4의 껍질이다.

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "입력값을 확인하세요.", "fields": {}, "requestId": "..." } }
```

`fields`는 있을 때만 넣는다. 헤더 `x-request-id`는 본문의 `requestId`와 같다. 성공 목록은 `{ data, meta }`, 성공 하나은 `{ data }`다. 삭제와 로그아웃은 204와 빈 본문이다.

추가로 이 서버가 쓰는 운영 코드가 있다. 502 `UPSTREAM`은 AI 서버가 실패할 때, 503 `SERVICE_UNAVAILABLE`은 결제 웹훅 비밀이 없을 때다. 스펙의 핵심 코드(400, 401, 403, 404, 409, 413, 429, 500)와 같이 `error` 껍질을 공유한다.

비유하면 OpenAPI는 메뉴판이고, `error.code`는 주방에서 쓰는 번호표다. 메뉴 문장이 바뀌어도 번호가 같으면 주문 기계는 그대로 돈다.

## ③ 🛠️ 실기

문서 플러그인 `src/plugins/docs.js`다.

```js
export const swaggerPlugin = fp(swaggerPluginImpl, { name: 'study-swagger' })

export async function swaggerUiPlugin(app) {
  await app.register(swaggerUi, {
    routePrefix: '/api-docs',
    uiConfig: { docExpansion: 'list' }
  })
}
```

1. `@fastify/swagger`는 `fp`로 감싼다. UI 플러그인이 같은 앱 스코프에서 스펙 플러그인을 찾아야 한다. 캡슐화된 채 등록하면 `FST_ERR_PLUGIN_DEPENDENCY_NOT_REGISTERED`가 난다.
2. UI 접두사는 `/api-docs`다. `APP_STAGE=final`에서만 등록된다.
3. OpenAPI 3.0.3, 제목은 `Fastify 게시판 API`, 버전 `1.0.0`이다. 보안 스키마 이름은 `bearerAuth`다.
4. 라우트 `schema.tags`가 문서의 묶음이 된다. `auth`, `posts`, `comments`, `uploads`, `payments`, `mail`, `ai`가 있다.
5. 헬멧 CSP는 `/api-docs`에서 건너뛴다. 문서 화면의 자산이 막히지 않게 하기 위해서다.

자원 표다.

| 자원 | 경로 | 비고 |
| --- | --- | --- |
| 건강 | `GET /health` | `/api` 밖, 인증 없음 |
| 사용자 | `/api/auth/signup`, `login`, `logout`, `me` | 로그아웃만 204 |
| 글 | `/api/posts`, `/api/posts/:id` | 목록은 meta, 등록은 201과 Location |
| 댓글 | `/api/posts/:id/comments`, `/api/comments/:id` | 삭제는 작성자 |
| 파일 | `/api/uploads` | final |
| 결제 | `/api/payments`, `.../confirm`, `.../webhook` | final |
| 메일 | `/api/mail` | 202 |
| 문서 | `/api/ai/documents` | final |

목록을 구현하는 `parseListQuery`는 잘못된 `page`를 400 `VALIDATION_ERROR`로, 너무 큰 `limit`는 50으로 자른 200으로 나눈다. 이 차이를 문서에 적지 않으면 클라이언트가 100을 보내고 400을 기다리다가 10개만 받아 헤맨다.

오류 코드를 추가할 때의 규칙이다. 새 상황은 기존 코드로 표현할 수 있으면 코드를 늘리지 않는다. 늘리면 `normalizeError`와 이 문서와 화면의 `messageForStatus`를 같이 고친다. 500에는 원인 문장을 넣지 않는다.

## ④ 🔗 연동 포인트

`examples/board.http`는 문서 화면과 같은 경로를 사람이 따라 치는 스크립트다. 테스트 `tests/api.test.js`는 그 계약이 깨지면 실패한다. 문서만 고치고 테스트가 옛 상태를 기대하면 둘 중 하나가 틀린 것이다.

화면의 페이지 버튼은 `meta.page`를 다음 요청의 `page`로 돌려보낸다. 서버가 `totalPages`를 0으로 주는 빈 목록도 버튼이 0을 넘는 번호를 요청하지 않게 하는 근거다.

study11에서 DB를 바꿔도 이 경로와 코드는 유지된다. 저장 엔진은 문서의 버전이 아니다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `/api-docs`가 404 | `APP_STAGE=basic` | `final`로 띄운다 |
| 문서 화면이 빈 흰 페이지 | CSP가 문서 자산을 막음 | `/api-docs` 경로는 CSP 예외다 |
| 플러그인 의존 오류 | swagger가 자식 스코프에만 있음 | `fp`로 감싼 `swaggerPlugin`을 UI보다 먼저 등록한다 |
| 클라이언트가 `limit=100`을 오류로 처리 | 상한을 400으로 착각 | 200과 `meta.limit === 50`을 계약으로 적는다 |
| 204를 JSON으로 파싱 | 빈 본문 | 본문 길이가 0이면 파싱하지 않는다 |

## ⑥ 직접 해보기

1. `APP_STAGE=final`로 띄우고 `http://127.0.0.1:3000/api-docs`에서 `posts` 묶음을 연다.
2. 목록을 `limit=10`과 `limit=100`으로 호출해 `meta.limit`이 10과 50인지 적는다.
3. 없는 `/api/nowhere`의 `error.code`와 `requestId`가 헤더와 같은지 확인한다.

## ⑦ ☐ 체크리스트

- ☐ 자원 경로가 동사 대신 명사와 HTTP 메서드로 나뉘어 있다
- ☐ OpenAPI가 `/api-docs`에 열리고 버전은 1.0.0이다
- ☐ 목록 `meta`의 `page`, `limit`, `total`, `totalPages`, `q`를 설명했다
- ☐ 오류 껍질과 상태 코드 표를 문서와 테스트가 같이 지킨다
- ☐ 호환을 깨는 변경과 코드만 추가하는 변경을 구분했다

## ⑧ 다음 단계

계약이 문서가 되었다. study15에서는 그 목록 조회를 짧게 기억하고, 메일처럼 기다리지 않아도 되는 일을 큐로 뺀 뒤 시간을 재는 방법을 둔다.
