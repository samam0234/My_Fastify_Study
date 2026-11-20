# study5. 폼, 입력, 검증

## ① 목표

사용자 입력을 JSON Schema로 검사하고, 실패 이유를 필드별로 보여 주며, 같은 요청이 두 번 저장되지 않게 막는다.

## ② 📖 이론

폼은 브라우저의 입력창이고, 서버가 믿는 값은 HTTP 본문이다. 화면에서 길이를 검사해도 요청은 화면을 거치지 않고 들어올 수 있다. 그래서 서버가 스키마로 다시 검사한다.

이 저장소의 스키마는 JSON Schema다. Fastify가 Ajv로 그 스키마를 실행한다. `app.js`의 Ajv 옵션은 `allErrors: true`, `coerceTypes: false`, `removeAdditional: false`다.

- `allErrors`는 첫 실수에서 멈추지 않고 필드 오류를 모은다.
- `coerceTypes: false`는 `"1"`을 숫자 1로 바꾸지 않는다. 쿼리는 문자열로 남고, 숫자 변환은 `parseListQuery`가 맡는다.
- `removeAdditional: false`와 스키마의 `additionalProperties: false`는 모르는 필드를 조용히 지우지 않고 400으로 거절한다.

검증이 실패하면 HTTP 400, 코드 `VALIDATION_ERROR`, 메시지 `입력값을 확인하세요.`다. `fields`는 `{ email: ["필수 항목입니다."], password: ["8자 이상 입력하세요."] }`처럼 필드 이름과 문장 배열이다. 스펙 v1은 검증 실패를 422가 아니라 400으로 정한다. 화면은 400과 422를 같은 “입력 수정” 흐름으로 다루되, 서버는 400만 낸다.

중복 제출은 새로고침과 더블클릭에서 난다. `Idempotency-Key` 헤더가 같으면 첫 성공 응답을 저장했다가 다시 보낸다. 본편이 저장하는 조건은 상태 코드가 200번대일 때뿐이다. 조회 키는 `userId|method|route|key`다. 키 문자는 8자 이상 80자 이하의 `[A-Za-z0-9._:-]`다.

한계도 있다. 재생은 스키마를 통과한 뒤에 일어난다. 두 번째 요청의 본문이 스키마에 어긋나면 저장된 응답을 돌려주지 않고 400이 된다. 처리 중 표시는 예제 서버의 메모리 `Set`으로만 보여 주고, 본편 저장소는 완료된 성공 응답만 남긴다.

비유하면 스키마는 창구 접수 양식이고, `fields`는 틀린 칸에 붙이는 쪽지다. 멱등 키는 영수증 번호라서, 같은 번호로 다시 오면 새 주문을 만들지 않고 원래 영수증을 복사해 준다.

## ③ 🛠️ 실기

전체 코드는 `examples/study5/server.js`다. `npm run example:form`은 3004번이다. 오류 핸들러를 라우트보다 먼저 둔다.

```js
import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

export function buildExample(options = {}) {
  const app = Fastify({ logger: options.logger ?? false })
  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      const fields = {}
      for (const item of error.validation) {
        const key = item.instancePath?.replace(/^\//, '') || item.params?.missingProperty || 'body'
        fields[key] ??= []
        fields[key].push(item.message)
      }
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: '입력값을 확인하세요.', fields, requestId: request.id } })
    }
    return reply.code(error.statusCode ?? 500).send({ error: { code: 'INTERNAL', message: '서버 오류가 발생했습니다.', requestId: request.id } })
  })
  const saved = new Map()
  const inFlight = new Set()
  app.post('/api/messages', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string', minLength: 1, maxLength: 100 } }
      }
    }
  }, async (request, reply) => {
    const key = request.headers['idempotency-key']
    if (key && saved.has(key)) return reply.code(saved.get(key).statusCode).send(saved.get(key).body)
    if (key && inFlight.has(key)) {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: '같은 요청을 처리하는 중입니다.', requestId: request.id } })
    }
    if (key) inFlight.add(key)
    const body = { data: { text: request.body.text } }
    if (key) {
      saved.set(key, { statusCode: 201, body })
      inFlight.delete(key)
    }
    return reply.code(201).send(body)
  })
  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3004), host: '127.0.0.1' })
}
```

줄별 설명이다.

6–16. `error.validation`이 있으면 Ajv 오류 배열이다. `instancePath`는 `/text`처럼 슬래시로 시작한다. 없으면 `missingProperty`를 키로 쓴다. 각 키의 문장을 배열에 모아 400 `VALIDATION_ERROR`로 보낸다.
17. 검증이 아닌 오류는 예제에서 500 고정 문구로 보낸다.
19–20. `saved`는 끝난 응답, `inFlight`는 처리 중인 키다. 프로세스 메모리라 재시작하면 사라진다.
21–28. 본문 스키마는 `text`만 받는다. 1자 이상 100자 이하다.
30–41. 같은 키가 이미 저장돼 있으면 그 상태 코드와 본문을 다시 보낸다. 아직 처리 중이면 409다. 새 키는 집합에 넣었다가 저장 후 뺀다. 이 예제는 `await`가 없어 실제 병렬 겹침은 거의 없고, 본편이 키를 저장소에 남기는 이유를 보여 주기 위한 자리다.

본편 회원가입 스키마 `src/schemas.js`의 해당 부분이다.

```js
const email = { type: 'string', minLength: 3, maxLength: 200, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }
const password = { type: 'string', minLength: 8, maxLength: 72 }
const nickname = { type: 'string', minLength: 1, maxLength: 30 }

export const signupBody = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password', 'nickname'],
  properties: { email, password, nickname }
}
```

1. 이메일은 공백과 `@` 위치를 정규식으로 본다. 저장 전에 라우트가 `trim().toLowerCase()`로 정규화한다.
2. 비밀번호는 8자 이상 72자 이하다. 72자 상한은 해시 함수에 넣기 전에 길이를 고정하기 위한 값이다.
3. 별명은 1자 이상 30자 이하다. 공백만 있으면 스키마는 통과할 수 있어 라우트가 한 번 더 `trim`하고 비어 있으면 `fields.nickname`을 던진다.

`fieldsFromValidation`은 Ajv의 `keyword`를 한국어 문장으로 바꾼다. `required`는 “필수 항목입니다.”, `minLength`는 “N자 이상 입력하세요.”, `pattern`은 “형식이 올바르지 않습니다.”다.

화면 `public/js/form.js`는 보내기 전에 비어 있는 칸을 막고, 응답 코드를 이렇게 나눈다.

- 200과 201은 성공. 목록을 다시 읽거나 상세로 이동한다.
- 400은 `fields`가 있으면 칸 아래에 문장을 붙인다. 422가 오더라도 같은 분기를 탄다.
- 401은 로그인 화면으로 돌린다.
- 그 외는 알림 문장만 보여 준다.

보내기 버튼은 요청이 끝나는 동안 `disabled`다. 이것이 클라이언트 쪽 중복 제출 방지다. 서버 쪽 방지는 글 작성과 댓글 작성의 `Idempotency-Key`다.

## ④ 🔗 연동 포인트

검증을 통과한 본문만 study6의 `repo.createPost`에 들어간다. 스키마가 거르지 못한 공백 별명처럼 도메인 규칙은 라우트가 `AppError(400, 'VALIDATION_ERROR', ..., fields)`로 같은 모양을 낸다.

화면은 `public/js/api.js`가 `credentials: 'include'`로 쿠키를 보내고, 안전하지 않은 메서드에는 `x-csrf-token`을 붙인다. 상태 코드에 따라 `form.js`가 칸 오류, 로그인 이동, 알림을 고른다.

멱등 키는 글 `POST /api/posts`와 댓글 `POST /api/posts/:id/comments`에 붙는다. 같은 사용자가 같은 경로에 같은 키를 다시 보내면 저장소의 상태 코드, 본문, `Location`을 재생한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 빈 본문이 500 | 스키마보다 앞에서 JSON 파싱이 실패했는데 핸들러가 기본 형식 | 파서 오류 코드를 `BAD_REQUEST`로 바꾸고, 핸들러를 라우트보다 먼저 등록한다 |
| 필드가 한 개만 보임 | Ajv `allErrors`가 꺼져 있음 | `allErrors: true`를 유지한다 |
| 쿼리 `limit=10`이 숫자로 바뀌어 스키마가 실패 | `coerceTypes`가 켜져 있거나 쿼리 스키마가 integer | 쿼리 스키마는 string으로 두고 `parseListQuery`가 변환한다 |
| 같은 키인데 400 | 두 번째 본문이 스키마를 통과하지 못함 | 재생 전에 본문을 첫 요청과 같이 맞춘다 |
| 더블클릭으로 글이 두 개 | 버튼만 믿거나 키를 안 보냄 | 버튼을 잠시 막고 `Idempotency-Key`를 보낸다 |
| 422를 기다렸는데 400 | 서버 계약이 400 `VALIDATION_ERROR` | 화면은 400의 `fields`를 읽는다 |

## ⑥ 직접 해보기

1. `POST /api/messages`에 `{}`와 `{ "text": "" }`를 보내 `fields`의 문장을 적는다.
2. 같은 `Idempotency-Key`로 `{ "text": "한번" }`을 두 번 보내 두 응답 본문이 같은지 본다.
3. 게시판 화면에서 제목을 비우고 저장해 보고, 개발자도구에서 400과 `fields`가 칸에 표시되는지 확인한다.

## ⑦ ☐ 체크리스트

- ☐ JSON Schema로 요청 검증 (Express에서는 Zod를 썼다)
- ☐ 빈 값, 길이, 모르는 필드를 서버가 400으로 거절한다
- ☐ 오류 본문에 `fields` 배열이 들어간다
- ☐ 화면이 200, 400, 422에 따라 성공, 칸 오류, 칸 오류로 나뉜다
- ☐ 저장 버튼이 요청 중에 다시 눌리지 않는다
- ☐ `Idempotency-Key`가 같으면 성공 응답을 다시 보낸다
- ☐ 검증 실패 코드는 `VALIDATION_ERROR`이고 HTTP는 400이다

## ⑧ 다음 단계

입력은 거르고 같은 저장은 한 번만 남긴다. study6에서는 그 입력을 SQLite에 넣고 목록, 상세, 등록, 수정, 삭제를 API 스펙에 맞춘다.
