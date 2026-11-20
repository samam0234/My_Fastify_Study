# study6. DB와 API 연동

## ① 목표

SQLite에 사용자, 글, 댓글을 저장하고, 공통 API 스펙 v1의 목록·상세·등록·수정·삭제를 환경변수로 연결 정보를 분리한 채 제공한다.

## ② 📖 이론

라우트는 HTTP를 알고, 저장소는 표를 안다. 사이에 `app.repo`가 있다. 라우트는 SQL을 쓰지 않고 `listPosts`, `createPost` 같은 메서드만 부른다. 저장소를 바꿔도 라우트 서명이 같게 두기 위해서다.

기본 엔진은 Node에 포함된 `node:sqlite`다. 파일 경로는 `SQLITE_PATH`, 기본값 `./data/board.db`다. 테스트는 `:memory:`를 넘겨 파일이 남지 않게 한다. 연결 문자열과 비밀은 코드에 없고 `.env`의 `DB_CLIENT`, `DATABASE_URL`에만 있다.

스펙 v1이 정한 성공 모양은 다음과 같다.

| 동작 | 메서드와 경로 | 성공 |
| --- | --- | --- |
| 건강 확인 | `GET /health` | 200 `{ status: "ok" }` |
| 목록 | `GET /api/posts` | 200 `{ data, meta }` |
| 상세 | `GET /api/posts/:id` | 200 `{ data }` |
| 등록 | `POST /api/posts` | 201, `Location: /api/posts/{id}` |
| 수정 | `PATCH /api/posts/:id` | 200 `{ data }` |
| 삭제 | `DELETE /api/posts/:id` | 204, 본문 없음 |
| 댓글 목록 | `GET /api/posts/:id/comments` | 200 `{ data }` |
| 댓글 등록 | `POST /api/posts/:id/comments` | 201 `{ data }` |
| 댓글 삭제 | `DELETE /api/comments/:id` | 204 |

목록 `meta`는 `page`, `limit`, `total`, `totalPages`, `q`다. `page` 기본 1, `limit` 기본 10, 상한 50이다. `q`는 제목과 본문을 대소문자 구분 없이 찾고, 없으면 `null`이다. 정렬은 `createdAt`, `-createdAt`, `-commentCount`다. 시각은 밀리초 없는 UTC ISO 문자열이다. 글 목록 항목에는 본문을 넣지 않고 `author: { id, nickname }`와 `commentCount`를 넣는다.

없는 글은 404 `NOT_FOUND`, 남의 글 수정은 403 `FORBIDDEN`, 번호가 숫자가 아니면 400 `BAD_REQUEST`다.

비유하면 `repo`는 창고 직원이다. 라우트는 주문서만 내고, 직원이 어느 선반을 여는지는 모른다. `.env`는 창고 주소가 적힌 쪽지라서 코드와 따로 둔다.

## ③ 🛠️ 실기

순서는 연결, 표, 저장소, 라우트, 오류다.

### 연결

`src/plugins/db.js`가 앱이 뜰 때 저장소를 연다.

```js
import fp from 'fastify-plugin'
import { openDatabase } from '../db/open.js'

async function dbPlugin(app) {
  const opened = await openDatabase(app.config)
  app.decorate('repo', opened.repo)
  app.addHook('onClose', async () => {
    await opened.close()
  })
}

export default fp(dbPlugin, { name: 'study-db' })
```

1. `fp`로 감싸야 `app.repo`가 라우트 플러그인에 보인다.
2. `openDatabase`는 `config.dbClient`를 본다.
3. 프로세스가 닫힐 때 `close`로 파일 잠금을 푼다.

SQLite를 여는 `openSqlite`의 핵심이다.

```js
export function openSqlite(file) {
  if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys = ON')
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  // prepare 캐시 뒤 adapter.get / all / run / insert
  return finish(adapter)
}
```

1. 파일 모드면 폴더를 만든다. `:memory:`는 폴더가 필요 없다.
2. `foreign_keys = ON`이어야 댓글의 글 참조가 실제로 검사된다.
3. 파일 모드만 WAL이다. 메모리 모드는 WAL 파일이 필요 없다.
4. `finish`가 `schemaStatements('sqlite')`를 실행하고 `createSqlRepository`를 돌려준다.

표는 `users`, `revoked_tokens`, `posts`, `comments`, `idempotency_keys`가 기초이고, 이후 단계를 위해 `uploads`, `payments`, `documents`, `questions`도 같은 파일에 만든다. 글 본문과 태그는 한 행에 둔다. 태그는 JSON 문자열이다.

### 모델과 저장소

`src/db/shape.js`의 `toUser`, `toPost`, `toComment`가 행을 도메인 객체로 바꾼다. 시각과 `tags` 파싱이 여기 있다. 라우트는 행의 `author_id`를 보지 않고 `post.author.id`를 본다.

`createSqlRepository`가 제공하는 메서드는 `ping`, `createUser`, `findUserByEmail`, `findUserById`, `revokeToken`, `isTokenRevoked`, `listPosts`, `findPostById`, `createPost`, `updatePost`, `deletePost`, `listComments`, `findCommentById`, `createComment`, `deleteComment`, `findIdempotency`, `saveIdempotency`다. 이메일 고유 제약에 걸리면 409 `EMAIL_TAKEN`으로 바꾼다.

검색의 `LIKE`는 이스케이프 문자를 `!`로 둔다. 값 안의 `!`, `%`, `_`는 `likeContains`가 `!`를 붙여 문자 그대로 찾게 한다.

### 라우트

`src/routes/posts.js` 전체다.

```js
import { AppError } from '../errors.js'
import { parseListQuery } from '../lib/http.js'
import { withIdempotency } from '../lib/idempotency.js'
import { presentPost } from '../lib/present.js'
import { requireAuth } from '../plugins/auth.js'
import { bearer, idParams, listQuery, postCreateBody, postListResponse, postPatchBody, postResponse } from '../schemas.js'

function cacheKey(query) {
  return `posts:${query.sort}:${query.page}:${query.limit}:${query.q ?? ''}`
}

function invalidate(app) {
  if (app.config.stage === 'final') app.cache.invalidate('posts:')
}

async function ownPost(app, request) {
  const post = await app.repo.findPostById(request.params.id)
  if (!post) throw new AppError(404, 'NOT_FOUND', '게시글을 찾을 수 없습니다.')
  if (post.author.id !== request.authUser.id) {
    throw new AppError(403, 'FORBIDDEN', '다른 사람의 글은 바꿀 수 없습니다.')
  }
  return post
}

export async function postRoutes(app) {
  app.get('/api/posts', { schema: { tags: ['posts'], querystring: listQuery, response: { 200: postListResponse } } }, async (request, reply) => {
    const query = parseListQuery(request.query)
    const key = cacheKey(query)
    if (app.config.stage === 'final') {
      const hit = app.cache.get(key)
      if (hit) {
        reply.header('x-cache', 'HIT')
        return hit
      }
    }
    const started = process.hrtime.bigint()
    const { items, total } = await app.repo.listPosts(query)
    const body = {
      data: items.map((post) => presentPost(post, false)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        q: query.q
      }
    }
    if (app.config.stage === 'final') {
      app.cache.set(key, body, app.config.cacheTtlMs)
      reply.header('x-cache', 'MISS')
      const ms = Number(process.hrtime.bigint() - started) / 1e6
      reply.header('server-timing', `db;dur=${ms.toFixed(2)}`)
    }
    return body
  })

  app.get('/api/posts/:id', { schema: { tags: ['posts'], params: idParams, response: { 200: postResponse } } }, async (request) => {
    const post = await app.repo.findPostById(request.params.id)
    if (!post) throw new AppError(404, 'NOT_FOUND', '게시글을 찾을 수 없습니다.')
    return { data: presentPost(post, true) }
  })

  app.post('/api/posts', {
    schema: { tags: ['posts'], security: bearer, body: postCreateBody, response: { 201: postResponse } },
    preValidation: requireAuth
  }, async (request, reply) => withIdempotency(app, request, reply, async () => {
    const post = await app.repo.createPost({
      authorId: request.authUser.id,
      title: request.body.title,
      body: request.body.body,
      tags: request.body.tags ?? []
    })
    invalidate(app)
    app.realtime.publish({ type: 'post.created', id: post.id })
    return { statusCode: 201, location: `/api/posts/${post.id}`, body: { data: presentPost(post, true) } }
  }))

  app.patch('/api/posts/:id', {
    schema: { tags: ['posts'], security: bearer, params: idParams, body: postPatchBody, response: { 200: postResponse } },
    preValidation: requireAuth
  }, async (request) => {
    const current = await ownPost(app, request)
    const post = await app.repo.updatePost(current.id, {
      title: request.body.title ?? current.title,
      body: request.body.body ?? current.body,
      tags: request.body.tags ?? current.tags
    })
    invalidate(app)
    return { data: presentPost(post, true) }
  })

  app.delete('/api/posts/:id', {
    schema: { tags: ['posts'], security: bearer, params: idParams },
    preValidation: requireAuth
  }, async (request, reply) => {
    const current = await ownPost(app, request)
    await app.repo.deletePost(current.id)
    invalidate(app)
    return reply.code(204).send()
  })
}
```

줄별 요지다.

1–7. 오류, 쿼리 파서, 멱등, 응답 변환, 인증 훅, 스키마를 가져온다.
9–14. 캐시 키와 무효화는 `APP_STAGE=final`에서만 동작한다. 기초 단계에서는 매 요청이 DB를 읽는다.
16–23. `ownPost`는 없음 404, 작성자 불일치 403을 한곳에서 낸다.
26–55. 목록은 쿼리를 파싱한 뒤 `repo.listPosts`를 부른다. `presentPost(post, false)`는 본문을 뺀다. `total`이 0이면 `totalPages`도 0이다.
57–61. 상세는 본문을 포함한다. 없으면 404다.
63–76. 등록은 `preValidation: requireAuth`라서 토큰이 없으면 본문 검증보다 먼저 401이다. 성공하면 201과 `Location`이다.
78–90. 수정은 보낸 필드만 바꾸고 나머지는 기존 값을 유지한다. 스키마 `minProperties: 1` 때문에 빈 객체는 400이다.
92–100. 삭제는 204와 빈 본문이다.

`presentPost(post, detail)`의 `detail === false`가 목록에서 `body`를 빼는 스위치다.

댓글 라우트 `src/routes/comments.js`는 글이 없으면 404, 작성자가 아니면 403, 삭제는 204다. 등록만 멱등 키를 받는다.

건강 확인 `GET /health`는 `repo.ping()`이 `SELECT 1`에 성공하면 `{ status: "ok" }`다. 이 경로는 `/api` 아래가 아니다.

### 실행

```text
copy .env.example .env
npm run dev
```

`.env`의 `DB_CLIENT=sqlite`, `SQLITE_PATH=./data/board.db`가 연결 정보다. `examples/board.http`에 회원가입부터 삭제까지 요청이 있다.

## ④ 🔗 연동 포인트

환경변수 `DB_CLIENT`와 `SQLITE_PATH`(또는 `DATABASE_URL`)만 바꾸면 `openDatabase`가 다른 함수로 간다. study11에서 PostgreSQL, MariaDB, MongoDB를 같은 `repo` 메서드로 받는 이유가 여기 있다.

화면 `public/js/api.js`는 같은 경로를 `fetch`로 호출한다. 목록의 `meta.page`가 화면 페이지 버튼의 입력이다.

오류는 study4의 `{ error: { code, message, requestId } }`를 그대로 쓴다. 저장소의 고유 제약만 409 `EMAIL_TAKEN`으로 번역한다.

`Idempotency-Key`의 조회 키에 사용자 아이디가 들어가므로, 다른 사람의 같은 헤더 값이 내 글 응답을 재생하지 않는다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `SQLITE_PATH` 폴더가 없다고 실패 | 상위 폴더 미생성 | `openSqlite`가 `mkdirSync`로 만든다. 권한 오류면 경로를 프로젝트 안으로 둔다 |
| 댓글을 지운 뒤에도 글이 남음 | 삭제는 댓글만 지운다 | 글을 지우면 외래 키 `ON DELETE CASCADE`로 댓글이 따라 지워진다 |
| 검색에 `%`를 넣으면 전체가 나옴 | LIKE 와일드카드 | `likeContains`가 `%`, `_`, `!`를 `!`로 이스케이프한다 |
| 목록 `limit=100`이 400 | 상한을 오류로 처리하는 스키마 | 이 서버는 50으로 잘라 200을 준다 |
| 401이 나야 하는데 400 | 인증 훅이 스키마보다 뒤 | `preValidation`은 스키마 검증 앞이다. 토큰이 없으면 401이다 |
| 본문 없는 204에 JSON 파싱 오류 | 클라이언트가 빈 본문을 `response.json()` | `api.js`는 빈 문자열이면 `null`로 둔다 |

## ⑥ 직접 해보기

1. 회원가입, 로그인, 글 작성, 목록, 상세, 수정, 삭제를 `examples/board.http` 순서로 보내고 상태 코드를 적는다.
2. `GET /api/posts?q=첫&limit=1&sort=-createdAt`의 `meta` 다섯 필드가 스펙과 같은지 본다.
3. 서버를 끈 뒤 `data/board.db`가 남는지 확인하고 다시 켜서 글이 있는지 본다. 테스트의 `:memory:`와 다른 점이다.

## ⑦ ☐ 체크리스트

- ☐ 연결 정보가 `.env`의 `DB_CLIENT`, `SQLITE_PATH`에만 있다
- ☐ 표가 생기고 `GET /health`가 `{ "status": "ok" }`다
- ☐ 목록, 상세, 등록, 수정, 삭제가 스펙의 상태 코드와 같다
- ☐ 등록 201에 `Location: /api/posts/{id}`가 있다
- ☐ 목록은 본문이 없고 `meta.q`가 없으면 `null`이다
- ☐ 없는 글은 404, 남의 글 수정은 403, 잘못된 번호는 400이다
- ☐ 댓글 등록과 삭제가 작성자 기준으로 동작한다

## ⑧ 다음 단계

글은 저장된다. study7에서는 그 글을 쓴 사람이 누구인지 토큰과 쿠키로 확인하고, 비밀번호와 브라우저 경계를 잠근다.
