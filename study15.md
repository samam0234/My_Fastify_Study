# study15. 성능과 캐시

## ① 목표

글 목록을 짧은 시간 기억하고, 메일은 응답 뒤에 처리하며, `Server-Timing`으로 그 차이를 측정한다.

## ② 📖 이론

성능 작업은 측정 다음에 한다. 이 서버가 재는 값은 목록 조회가 저장소를 읽는 데 걸린 시간이다. `process.hrtime.bigint()`로 시작하고, 응답 헤더 `server-timing: db;dur=...`에 밀리초를 적는다. 캐시에 맞으면 그 헤더 없이 `x-cache: HIT`만 준다.

캐시는 프로세스 안 `Map`이다. 키는 `posts:정렬:페이지:개수:검색어`다. 값에는 만료 시각이 있고, `CACHE_TTL_MS` 기본 5초가 지나면 `get`이 지우고 미스로 본다. 글이나 댓글이 바뀌면 `posts:` 접두사를 모두 지운다. 서버가 두 대면 이 기억은 서로 공유되지 않는다. 한 프로세스 학습용이다.

백그라운드 작업은 `createQueue`다. `push`가 프라미스 사슬 뒤에 함수를 붙이고 바로 작업 번호를 돌려준다. 메일은 이 큐에 들어간 뒤 202를 먼저 보낸다. 프로세스가 닫히기 전에 `waitIdle`이 사슬이 끝나기를 기다린다. 큐도 메모리라 프로세스가 죽으면 아직 쓰지 못한 메일은 사라진다.

비동기라는 말은 여기서 두 가지다. 라우트 핸들러의 `async`는 데이터베이스를 기다리는 동안 다른 요청을 받을 수 있게 한다. 큐의 `push`는 이 요청의 응답을 그 기다림에 묶지 않는다.

비유하면 캐시는 5초짜리 계산대 메모고, 큐는 계산이 끝난 뒤 포장하는 뒤쪽 작업대다. `Server-Timing`은 계산에 몇 초가 걸렸는지 영수증에 찍는 숫자다.

## ③ 🛠️ 실기

캐시 전체다.

```js
export function createCache() {
  const store = new Map()
  return {
    get(key) {
      const found = store.get(key)
      if (!found) return undefined
      if (found.expiresAt <= Date.now()) {
        store.delete(key)
        return undefined
      }
      return found.value
    },
    set(key, value, ttlMs) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    invalidate(prefix) {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key)
      }
    }
  }
}
```

1. `get`은 없거나 만료면 `undefined`다. 호출자는 그때 DB를 읽는다.
2. `set`은 지금 시각에 `ttlMs`를 더한다. 0이면 다음 `get`에서 곧 만료다.
3. `invalidate`는 접두사가 같은 키만 지운다. 글 목록과 다른 캐시가 생겨도 `posts:`만 버릴 수 있다.

목록 라우트의 측정 부분이다.

```js
if (app.config.stage === 'final') {
  const hit = app.cache.get(key)
  if (hit) {
    reply.header('x-cache', 'HIT')
    return hit
  }
}
const started = process.hrtime.bigint()
const { items, total } = await app.repo.listPosts(query)
if (app.config.stage === 'final') {
  app.cache.set(key, body, app.config.cacheTtlMs)
  reply.header('x-cache', 'MISS')
  const ms = Number(process.hrtime.bigint() - started) / 1e6
  reply.header('server-timing', `db;dur=${ms.toFixed(2)}`)
}
```

1. `basic` 스테이지는 캐시 헤더를 만들지 않는다. 매번 저장소를 읽는다.
2. HIT는 DB 시간을 재지 않는다. 재고 싶은 것은 저장소 비용이다.
3. MISS는 읽은 뒤에 저장하고 시간을 소수 둘째 자리 밀리초로 적는다.

큐는 `push` → 상태 `queued` → 사슬에서 `running` → `done` 또는 `failed`다. 실패는 로그에 `백그라운드 작업이 실패했습니다.`로 남고 이미 보낸 202를 바꾸지 못한다. 그래서 메일은 아웃박스 파일을 먼저 쓰고, SMTP 실패는 로그로 본다.

최적화 순서는 이렇다. 같은 목록을 두 번 호출해 MISS와 HIT를 확인한다. HIT가 나와도 본문이 옛 글이면 무효화 접두사를 의심한다. 글을 작성한 직후 목록이 새 글을 포함하면 무효화가 동작한 것이다. 숫자 개선은 `server-timing`의 `dur`를 전후로 적는다. 캐시 적중을 속도로 착각하지 않는다.

## ④ 🔗 연동 포인트

캐시 무효화는 글 작성, 수정, 삭제와 댓글 작성, 삭제에서 `invalidate('posts:')`를 호출한다. 댓글 수가 정렬 `-commentCount`에 들어가므로 댓글만 바꿔도 목록 키를 버려야 한다.

메일 202는 study13의 라우트가 이 큐에 `deliverMail`을 넣는 결과다. 테스트는 `app.queue.waitIdle()` 뒤에 `GET /api/mail`을 본다.

`CACHE_TTL_MS`는 환경변수다. 배포마다 5초를 더 줄이거나 늘릴 수 있다. 프로세스 메모리 한계를 넘는 공용 캐시가 필요해지면 이 `Map` 자리를 바꾸되, 키 형식과 무효화 접두사는 라우트 계약으로 남긴다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 항상 MISS | `APP_STAGE`가 `basic`이거나 TTL이 0 | `final`과 `CACHE_TTL_MS`를 확인한다 |
| 글을 써도 목록이 옛 데이터 | 무효화 접두사가 다름 | 키는 `posts:`로 시작한다 |
| 서버가 두 대인데 캐시가 어긋남 | 메모리가 프로세스별 | 이 구현의 한계다. 한 프로세스에서만 맞다 |
| 202 메일이 재시작 후 없음 | 큐가 메모리 | 중요한 메일은 아웃박스 파일이 남았는지 본다. 큐에만 있던 작업은 사라진다 |
| `server-timing`이 HIT에도 있어야 한다고 착각 | HIT는 DB를 안 읽음 | 미스의 `dur`만 저장소 시간이다 |

## ⑥ 직접 해보기

1. `GET /api/posts`를 두 번 보내 `x-cache`가 MISS 다음 HIT인지 본다.
2. 글을 하나 만든 직후 같은 목록이 다시 MISS이고 새 글을 포함하는지 확인한다.
3. 메일을 보내고 응답이 202인 동안 `data/outbox`에 파일이 조금 뒤 생기는지, `wait` 없이 바로 폴더를 보면 순서가 어떻게 보이는지 적는다.

## ⑦ ☐ 체크리스트

- ☐ 목록 캐시 키에 정렬, 페이지, 개수, 검색어가 들어간다
- ☐ HIT와 MISS 헤더를 구분하고 TTL을 환경변수로 바꾼다
- ☐ 글과 댓글 변경이 `posts:` 캐시를 지운다
- ☐ 메일 202와 큐의 `waitIdle` 차이를 설명했다
- ☐ `server-timing`으로 미스의 DB 시간을 읽었다

## ⑧ 다음 단계

한 프로세스 안의 캐시와 큐를 측정했다. study16에서는 그 프로세스를 이미지로 만들고, 테스트가 푸시마다 돌게 하며, 로그와 백업을 점검표로 남긴다.
