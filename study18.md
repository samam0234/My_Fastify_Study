# study18. AI 연동과 MCP

## ① 목표

문서 요약과 근거 있는 질문 답변을 Fastify에 붙이고, 발췌가 없으면 모른다고 말하며, 같은 조회를 MCP 도구로도 연다.

## ② 📖 이론

이 단원은 문서 요약과 근거 질문이라는 작은 서비스를 Fastify 라우트로 구현한다. 문서를 올리면 요약을 만들고, 질문에는 문서 조각만 근거로 답한다. 근거 조각이 없으면 `문서에서 찾을 수 없습니다.`만 돌려준다. 추측으로 빈칸을 채우지 않는다.

모델이 없을 때도 동작해야 학습이 끊기지 않는다. `AI_BASE_URL`이 비어 있으면 요약은 문장 나누기(`extractiveSummary`)이고, 답변은 검색된 첫 조각에 `(발췌 1)`을 붙인 문자열이다. 주소가 있으면 OpenAI 호환 `POST /v1/chat/completions`를 호출한다. 로컬에서 그 경로를 여는 서버가 있다면 `AI_BASE_URL`과 `AI_MODEL`만 맞추면 된다. 키는 `AI_API_KEY`다.

검색은 한글 음절 두 글자 묶음과 영문 단어의 TF-IDF다. 한 글자 음절만 겹치는 질문은 점수가 나지 않는다. “오늘 날씨”가 “요청”의 `요` 한 글자 때문에 근거가 되는 일을 막기 위해서다. 상위 3개 조각만 프롬프트에 넣는다.

프롬프트는 `buildMessages`가 시스템 문장과 사용자 문장을 만든다. 시스템 문장은 “발췌만 근거로 답하고, 없으면 찾을 수 없다고만 말하라”다. 요약 모드는 파일 이름과 발췌를 주고 3문장 안을 요청한다. 질문 모드는 발췌 뒤에 질문을 붙인다.

스트리밍 화면은 `POST /api/ai/documents/:id/questions/stream`이다. 응답은 `text/event-stream`이고, 답을 12자씩 잘라 `data:` 줄로 보낸 뒤 `{"done":true}`로 끝낸다. `Readable`로 보내야 테스트의 `inject`가 본문을 받을 수 있다. `reply.raw`를 직접 쓰면 그 본문을 테스트가 못 읽는다. 모델이 있을 때도 이 경로는 먼저 답을 모은 뒤 잘라 보낸다. 공급자 토큰을 받는 즉시 클라이언트에 흘리는 것은 이후 개선이다.

MCP는 HTTP와 다른 프로세스다. `npm run mcp`가 `src/mcp/server.js`를 띄우고, 표준입출력에 `Content-Length` 머리와 JSON을 주고받는다. 도구는 `list_documents`와 `ask_document`다. 답변은 발췌 검색만 사용한다. 모델 URL이 있어도 MCP 도구는 네트워크를 열지 않는다. `SQLITE_PATH`가 가리키는 파일을 연 사람만 쓰는 경계다. HTTP의 로그인 검사는 이 프로세스에 없다.

비유하면 발췌는 접어 둔 쪽지다. 모델은 그 쪽지를 읽어 주는 사람이고, 쪽지가 없으면 “그 내용은 이 문서에 없습니다”라고만 말한다. MCP는 같은 쪽지를 HTTP가 아닌 창구에서 꺼내는 서랍이다.

## ③ 🛠️ 실기

요약과 답의 분기 `src/routes/ai.js`다.

```js
async function summarize(app, filename, text) {
  const chunks = splitChunks(text)
  if (!app.config.aiBaseUrl) return extractiveSummary(text)
  return completeChat({
    baseUrl: app.config.aiBaseUrl,
    apiKey: app.config.aiApiKey,
    model: app.config.aiModel,
    messages: buildMessages({ filename, chunks, mode: 'summary' })
  })
}

async function answerQuestion(app, document, question, streaming) {
  const chunks = splitChunks(document.sourceText)
  const found = searchChunks(chunks, question, 3)
  if (found.length === 0 || !app.config.aiBaseUrl) return answerFromExcerpts(found)
  const messages = buildMessages({
    filename: document.filename,
    chunks: found.map((item) => item.text),
    question,
    mode: 'ask'
  })
  const settings = { baseUrl: app.config.aiBaseUrl, apiKey: app.config.aiApiKey, model: app.config.aiModel, messages }
  const answer = streaming ? await streamChat(settings) : await completeChat(settings)
  return { answer, sources: sourcesFrom(found) }
}
```

1. 문서를 빈 줄 기준으로 약 400자 조각으로 나눈다.
2. 모델 주소가 없으면 추출 요약이나 발췌 답을 바로 반환한다.
3. 검색 결과가 없으면 모델이 있어도 `answerFromExcerpts`가 고정 문장을 준다. 없는 근거로 모델을 호출하지 않는다.
4. 모델 호출이 8초를 넘기거나 HTTP가 실패하면 502 `UPSTREAM`이다. 스택은 클라이언트에 주지 않는다.

HTTP 경로다. 모두 로그인이 필요하고 문서 소유자만 질문할 수 있다.

| 메서드와 경로 | 결과 |
| --- | --- |
| `POST /api/ai/documents` | 201, 요약이 포함된 문서 |
| `GET /api/ai/documents` | 내 문서 목록, 본문 생략 |
| `GET /api/ai/documents/:id` | 상세 |
| `POST /api/ai/documents/:id/questions` | 201, 답과 발췌 |
| `GET /api/ai/documents/:id/questions` | 그 문서의 질문 기록 |
| `POST .../questions/stream` | `text/event-stream` |

파일 이름은 `path.basename`만 저장한다. 경로를 파일 이름처럼 보이게 보내지 못한다.

MCP 핸들러의 도구 호출이다.

```js
if (name === 'list_documents') {
  return result(message.id, toolText(await repo.listEveryDocument()))
}
if (name === 'ask_document') {
  const found = searchChunks(splitChunks(document.sourceText), question, 3)
  return result(message.id, toolText({ filename: document.filename, ...answerFromExcerpts(found) }))
}
```

1. `initialize`는 프로토콜 `2024-11-05`과 서버 이름 `fastify-study`를 돌려준다.
2. `tools/list`는 위 두 도구의 입력 스키마를 준다.
3. `list_documents`는 소유자 구분 없이 파일 안의 문서를 나열한다. 이 프로세스를 실행한 사람의 파일만 열리게 `SQLITE_PATH`로 제한한다.
4. `ask_document`는 HTTP와 같은 `문서에서 찾을 수 없습니다.`를 쓴다.
5. 클라이언트 `callMcpTool`은 자식을 띄우고, 끝나면 stdin을 닫아 서버가 DB를 닫고 종료하게 기다린다. 바로 프로세스를 죽이면 Windows에서 SQLite 파일이 잠긴다.

예시 호출이다.

```text
set SQLITE_PATH=./data/board.db
npm run mcp
```

학습 테스트는 이 명령을 직접 열어 두지 않고 `callMcpTool`로 한 번 호출한다.

## ④ 🔗 연동 포인트

문서 표는 study6의 같은 SQLite 파일에 있다. HTTP로 만든 문서를 MCP가 `SQLITE_PATH`로 다시 연다. 테스트는 앱을 `close`한 뒤 MCP를 불러 파일 잠금이 풀린 다음 목록을 읽는다.

화면 스트리밍은 `fetch`가 `text/event-stream`을 읽으면 된다. 게시판 `main.js`는 이 경로를 아직 버튼으로 연결하지 않았다. 계약은 라우트와 테스트에 있다. 최종 문서에서 게시판 기능 옆에 문서 요약을 올린다.

모델이 있는 배포는 `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`만 추가하면 된다. 코드의 프롬프트 문장은 그대로다. 키가 로그에 남지 않게 헤더 redact 대상에 인증 헤더가 포함되어 있다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 관련 없는 질문에 문서 문장이 답으로 나옴 | 한 글자 토큰이 겹침 | 검색 토큰은 두 글자 묶음과 영단어만 쓴다 |
| 모델이 문서 밖 내용을 지어냄 | 빈 검색인데도 모델을 호출 | `found.length === 0`이면 모델을 부르지 않는다 |
| 502 `UPSTREAM` | 주소 오류, 8초 초과, HTTP 실패 | `AI_BASE_URL`을 비우면 추출 모드로 돌아간다 |
| 스트림 본문이 테스트에서 빔 | `reply.raw`에 직접 씀 | `Readable`을 `reply.send`한다 |
| MCP가 `SQLITE_PATH가 필요합니다` | 환경변수 없음 | 파일 DB 경로를 자식 환경에 넣는다 |
| MCP 뒤 테스트 파일 삭제 `EBUSY` | 자식이 DB를 안 닫음 | stdin을 닫고 종료를 기다린다 |

## ⑥ 직접 해보기

1. `POST /api/ai/documents`에 짧은 글을 넣고 요약에 그 문장이 보이는지, 전혀 다른 질문에는 `문서에서 찾을 수 없습니다.`가 오는지 본다.
2. 같은 문서에 스트림 경로를 호출해 `content-type`이 이벤트 스트림이고 마지막에 `done`이 있는지 확인한다.
3. `AI_BASE_URL`을 비운 이유와, 주소를 넣으면 어떤 경로로 요청이 나가는지 `ai-client.js`에서 한 줄로 적는다.

## ⑦ ☐ 체크리스트

- ☐ 문서 등록이 요약을 만들고 소유자만 질문을 볼 수 있다
- ☐ 프롬프트가 발췌 밖 내용을 모른다고 말하게 적혀 있다
- ☐ 근거가 없으면 모델을 부르지 않고 고정 문장을 준다
- ☐ 스트림 응답이 `text/event-stream`이다
- ☐ `AI_BASE_URL`이 없으면 추출 요약으로 동작한다
- ☐ MCP 도구 `list_documents`와 `ask_document`가 같은 파일 DB를 읽는다
- ☐ MCP는 모델 네트워크를 열지 않는다

## ⑧ 다음 단계

요약과 근거 답과 MCP까지 붙였다. `studyfinal.md`에서 게시판, DB, 외부 서비스, 이 문서 기능, 컨테이너, 테스트를 한 서비스 점검으로 모은다.
