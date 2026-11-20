# study3. 데이터 다루기

## ① 목표

서버의 메모는 JSON 파일에, 브라우저의 임시 입력은 `localStorage`에 두고, 응답 스키마로 화면이 기대하는 모양을 고정한다.

## ② 📖 이론

데이터는 사는 곳이 다르다. 서버 메모는 프로세스가 꺼져도 남아야 하므로 파일에 쓴다. 입력창의 초고는 그 브라우저만의 일이므로 `localStorage`에 둔다. 둘을 한곳에 넣으면, 새로고침 초안과 공유 메모의 수명이 섞인다.

이 단계의 상태 개념은 세 겹이다.

- 요청 안의 값. `request.body.text`는 그 요청이 끝나면 사라진다.
- 프로세스 안의 값. 변수와 배열이다. 파일을 읽기 전에는 여기 없다.
- 프로세스 밖의 값. `notes.json`과 브라우저 저장소다.

바인딩은 “데이터를 화면에 묶는 일”이다. 이 예제는 서버가 HTML을 줄 때 스크립트를 함께 보낸다. 스크립트가 `input` 이벤트가 날 때마다 `localStorage.setItem`을 호출하고, 다음 방문에서 `getItem`으로 입력창을 채운다. 서버 메모 목록은 `GET /notes`의 JSON을 화면이 다시 그릴 때 쓴다. 게시판 본편은 이 역할을 `public/js/state.js`의 작은 저장소가 맡는다.

응답 스키마는 직렬화 계약이다. `text`가 없는 객체를 넣으면 Fastify가 응답을 스키마에 맞춰 걸러 낸다. 화면은 “배열 안의 각 항목에 `text`가 있다”만 믿으면 된다.

비유하면 파일은 공용 공책, `localStorage`는 개인 메모지다. 스키마는 공책에서 찢어 줄 쪽의 양식이다.

## ③ 🛠️ 실기

전체 코드는 `examples/study3/server.js`다. `npm run example:notes`는 3002번 포트다. 파일 기본 위치는 예제 옆 `data/notes.json`이다.

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Fastify from 'fastify'
import { pathToFileURL } from 'node:url'

const defaultFile = new URL('./data/notes.json', import.meta.url)

export function buildExample(options = {}) {
  const filePath = options.filePath ?? defaultFile
  const app = Fastify({ logger: options.logger ?? false })

  async function load() {
    try {
      return JSON.parse(await readFile(filePath, 'utf8'))
    } catch {
      return []
    }
  }

  async function save(notes) {
    const directory = typeof filePath === 'string' ? path.dirname(filePath) : new URL('./', filePath)
    await mkdir(directory, { recursive: true })
    await writeFile(filePath, JSON.stringify(notes, null, 2))
  }

  app.get('/', async (request, reply) => {
    const html = `<!doctype html><meta charset="utf-8"><title>메모</title>
<main><label>임시 제목<input id="draft"></label><p id="saved"></p></main>
<script>
const key = 'fastify-note-draft'
const input = document.querySelector('#draft')
input.value = localStorage.getItem(key) ?? ''
input.addEventListener('input', () => localStorage.setItem(key, input.value))
document.querySelector('#saved').textContent = '이 입력은 브라우저 localStorage에 남습니다. 서버 메모는 /notes 입니다.'
</script>`
    return reply.type('text/html; charset=utf-8').send(html)
  })

  app.get('/notes', {
    schema: {
      response: {
        200: {
          type: 'object',
          required: ['data'],
          properties: { data: { type: 'array', items: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } } }
        }
      }
    }
  }, async () => ({ data: await load() }))

  app.post('/notes', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string', minLength: 1, maxLength: 200 } }
      }
    }
  }, async (request, reply) => {
    const notes = await load()
    notes.push({ text: request.body.text })
    await save(notes)
    return reply.code(201).send({ data: notes.at(-1) })
  })

  return app
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (direct) {
  const app = buildExample({ logger: true })
  await app.listen({ port: Number(process.env.PORT ?? 3002), host: '127.0.0.1' })
}
```

줄별 설명이다.

1–2. 파일 읽기, 쓰기, 디렉터리 생성을 비동기로 가져온다. `path`는 문자열 경로의 폴더를 구할 때 쓴다.
6. 기본 파일은 이 모듈 기준 상대 URL이다. 테스트를 다른 폴더에서 실행해도 예제 옆으로 저장된다.
9. 옵션으로 경로를 바꾸면 테스트가 임시 파일을 쓴다. 없으면 기본 URL을 쓴다.
12–18. `load`는 파일을 읽어 배열로 파싱한다. 파일이 없거나 JSON이 아니면 빈 배열이다. 첫 실행이 실패로 끝나지 않게 한다.
20–24. `save`는 폴더를 만든 뒤 들여쓰기 2칸 JSON으로 덮어쓴다. 경로가 문자열이면 `path.dirname`, URL이면 그 파일의 디렉터리 URL을 쓴다.
26–37. `GET /`는 입력창과 스크립트를 보낸다. 키 이름은 `fastify-note-draft`다. 열릴 때 저장값을 넣고, `input` 이벤트마다 다시 저장한다. 안내 문장은 서버 메모와 브라우저 초안이 다르다고 말한다.
39–49. `GET /notes`의 응답 스키마는 `{ data: [{ text: string }] }`만 허용한다. 핸들러는 `load()` 결과를 그대로 넣는다.
51–65. `POST /notes`는 본문 스키마로 `text`만 받는다. 추가 속성은 거절한다. 길이는 1자 이상 200자 이하다. 통과한 뒤에만 배열에 넣고 파일에 쓴 다음 201과 마지막 항목을 보낸다.
70–73. 직접 실행이면 3002번에 연다.

게시판 본편의 같은 역할은 다음이다.

- 서버 상태의 단일 출처는 `app.repo`다. 기본은 `./data/board.db` 파일이다.
- 화면 상태는 `public/js/state.js`의 `createStore`다. `set`이 구독자에게 새 객체를 넘긴다.
- 글 초안은 `public/js/main.js`가 `localStorage` 키 `fastify-board-draft`에 넣는다.

`createStore` 전체다.

```js
export function createStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    get() { return state },
    set(partial) {
      state = { ...state, ...partial }
      for (const listener of listeners) listener(state)
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(state)
      return () => listeners.delete(listener)
    }
  }
}
```

1. 처음 상태를 클로저에 둔다. 바깥에서 변수를 직접 못 바꾼다.
2. `set`은 일부 필드만 받아 새 객체를 만들고  listeners를 호출한다.
3. `subscribe`는 등록 즉시 현재 상태를 한 번 보내고, 해제 함수를 돌려준다.

## ④ 🔗 연동 포인트

파일 JSON은 study6 데이터베이스의 자리표시자다. `load`/`save` 자리를 `repo.listPosts`, `repo.createPost`가 대신하면 라우트 모양은 거의 같다.

응답 스키마의 `{ data }` 껍질은 공통 API의 성공 형식이다. study6부터 목록은 `{ data, meta }`로 넓어진다.

`localStorage` 초안은 로그인과 무관하다. study7에서 쿠키로 로그인 상태를 공유한 뒤에도 초안 키는 브라우저에 남는다. 로그아웃이 서버 글을 지우지는 않듯이, 초안을 서버 본문으로 오해하지 않는다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `POST /notes`가 400 | `text`가 없거나 빈 문자열, 200자 초과, 모르는 필드 | 스키마의 `required`, `minLength`, `additionalProperties`를 만족하는 JSON만 보낸다 |
| 새로고침 후 목록이 비어 있음 | 저장 전에 프로세스가 죽거나 다른 `filePath`를 봄 | 응답 201 이후에 파일을 열어 배열이 늘었는지 확인한다 |
| 입력창만 남고 서버에는 없음 | `localStorage`와 파일을 같은 저장소로 착각 | 초안은 브라우저, 확정 메모는 `POST /notes`다 |
| 스키마 때문에 필드가 사라짐 | 응답 스키마에 없는 속성은 직렬화에서 빠진다 | 화면에 보여줄 필드를 `properties`에 적는다 |
| 동시에 두 요청이 파일을 덮어씀 | 읽기와 쓰기 사이에 잠금이 없음 | 학습용 한계다. 게시판은 SQLite 트랜잭션으로 이 자리를 바꾼다 |

## ⑥ 직접 해보기

1. `http://127.0.0.1:3002/`에서 입력창에 글을 쓰고 새로고침한다. 값이 남아 있으면 `localStorage`다. 개발자도구 Application 탭에서 키 `fastify-note-draft`를 찾는다.
2. `POST /notes`에 `{ "text": "첫 메모" }`를 보내고 `GET /notes`에 보이는지, 프로세스 재시작 뒤에도 남는지 확인한다.
3. `{ "text": "" }`와 `{ "text": "메모", "extra": 1 }`을 보내 둘 다 거절되는지 본다.

## ⑦ ☐ 체크리스트

- ☐ 서버 메모를 JSON 파일에 저장하고 다시 읽었다
- ☐ 파일이 없을 때 빈 배열로 시작한다
- ☐ 응답 스키마가 `data` 배열과 `text` 문자열을 요구한다
- ☐ 본문 스키마가 빈 문자열과 추가 필드를 거절한다
- ☐ 브라우저 초안이 `localStorage`에 남고, 서버 파일과는 따로 논다
- ☐ `createStore`처럼 상태를 한곳에서 고치고 구독자에게 알리는 방식을 설명할 수 있다

## ⑧ 다음 단계

데이터가 파일에 있다. study4에서는 주소로 그 데이터를 고르고, 없는 경로와 잘못된 번호를 공통 오류 모양으로 돌려준다.
