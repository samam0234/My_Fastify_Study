# study17. 실시간과 확장

## ① 목표

웹소켓으로 글 작성 알림을 보내고, 올라온 파일을 소유자만 다시 받게 한다.

## ② 📖 이론

HTTP 한 번은 질문과 답으로 끝난다. 다른 사람이 글을 쓴 사실을 그 연결로 다시 알리려면 서버가 먼저 말할 통로가 필요하다. `@fastify/websocket`이 `GET /ws`를 그 통로로 업그레이드한다.

소켓 인증은 헤더보다 쿼리와 쿠키가 현실적이다. 브라우저 `WebSocket` API는 임의 Authorization 헤더를 붙이기 어렵다. 그래서 `token` 쿼리 또는 `access_token` 쿠키를 `jwt.verify`한다. `jti`가 폐기됐으면 close 코드 `4001`이다. 통과하면 `{ type: 'ready', userId }`를 보내고, 클라이언트의 `ping` 문자열에는 `{ type: 'pong' }`을 답한다.

알림 발행은 `app.realtime.publish`다. 글 작성 라우트가 `{ type: 'post.created', id }`를 모든 열린 소켓에 보낸다. 받는 쪽은 그 아이디로 `GET /api/posts/:id`를 다시 호출해 본문을 채운다. 소켓 메시지 안에 글 본문을 넣지 않아, 소켓이 목록 API의 권한과 스키마를 우회하지 않게 한다.

파일 처리는 study13의 업로드와 같은 코드다. 이 단원에서는 “받은 파일을 나중에 다시 처리한다”는 확장 자리로 다시 본다. 저장 이름은 UUID, 경로는 업로드 루트 안, 다운로드는 소유자 검사 뒤 스트림이다.

한계는 분명하다. `realtime`의 소켓 목록도 프로세스 메모리다. 앱이 두 대면 한쪽에서 쓴 글이 다른 쪽 소켓으로 가지 않는다. 알림을 놓치면 클라이언트가 목록을 다시 읽으면 된다. 소켓은 힌트이고 저장소가 사실이다.

비유하면 웹소켓은 매장 방송이고, `post.created`는 “새 글 번호만 읽는 방송”이다. 상품 설명은 손님이 진열대(API)에서 다시 확인한다.

## ③ 🛠️ 실기

`src/routes/realtime.js` 전체다.

```js
import websocket from '@fastify/websocket'

export async function realtimeRoutes(app) {
  await app.register(websocket)
  app.get('/ws', { websocket: true }, async (socket, request) => {
    const token = request.query.token || request.cookies?.access_token
    let payload
    try {
      payload = app.jwt.verify(token)
      if (!payload?.jti || await app.repo.isTokenRevoked(payload.jti)) throw new Error('revoked')
    } catch {
      socket.close(4001, 'unauthorized')
      return
    }
    app.realtime.add(socket)
    socket.send(JSON.stringify({ type: 'ready', userId: Number(payload.sub) }))
    socket.on('message', (raw) => {
      if (String(raw) === 'ping') socket.send(JSON.stringify({ type: 'pong' }))
    })
    socket.on('close', () => app.realtime.remove(socket))
  })
}
```

1. `websocket: true`인 GET만 업그레이드된다. 이 라우트는 `final` 스테이지에만 있다.
2. 토큰은 쿼리가 우선이고 없으면 쿠키다. 둘 다 없으면 `verify`가 실패해 4001로 닫힌다.
3. 폐기된 `jti`도 같은 close다. HTTP의 401과 번호만 다르고 의미는 같다.
4. `add` 뒤에 `ready`를 보낸다. 클라이언트는 이 메시지를 받기 전에는 연결이 인증됐다고 보지 않는다.
5. 메시지는 `ping`만 특별하다. 그 외 문자열은 무시한다.
6. `close`에서 목록에서 빼야 죽은 소켓에 `send`하지 않는다.

발행 쪽은 글 작성 성공 후 한 줄이다.

```js
app.realtime.publish({ type: 'post.created', id: post.id })
```

화면 `public/js/main.js`는 로그인 뒤에 `/ws?token=` 대신 쿠키가 따라가는 주소로 연결할 수 있다. 테스트는 토큰 쿼리로 `ready`를 받은 뒤 글을 작성하고 `post.created`의 `id`가 응답과 같은지 본다. `inject`는 업그레이드를 대신하지 못해 이 테스트만 `listen`으로 포트를 연다.

파일 쪽 확장 순서는 업로드 201, 저장 이름이 원본과 다른지 확인, 소유자의 GET이 스트림, 다른 사용자의 GET이 403이다. 이미지든 텍스트든 처리 함수에 넘기기 전에 `resolveStored`가 루트 밖을 거절해야 한다.

## ④ 🔗 연동 포인트

알림의 `id`는 `GET /api/posts/:id`의 경로 번호다. 소켓을 못 열어도 목록 조회로 같은 글을 볼 수 있다. 캐시가 켜져 있으면 작성 라우트가 `posts:`를 지우므로, 알림을 받은 클라이언트의 다음 목록은 미스가 되어 새 글을 포함한다.

로그아웃은 `jti`를 폐기한다. 이미 열린 소켓은 다음 메시지 검사 때가 아니라, 새로 연결할 때 4001이 된다. 학습용으로는 로그아웃 시 그 사용자의 소켓을 닫는 자리를 `realtime`에 더할 수 있다. 지금 코드는 새 연결만 막는다.

파일 경로는 `UPLOAD_DIR` 환경변수다. 컨테이너에서는 `/data/uploads`이고 볼륨과 함께 남는다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `/ws`가 404 | `APP_STAGE=basic` | `final`로 띄운다 |
| 소켓이 바로 닫힘, 1000이 아님 | 토큰 없음 또는 폐기. close 4001 | 로그인 쿠키나 `token` 쿼리를 넣는다 |
| `ready` 전에 알림을 기다림 | 연결 직후 서버 메시지를 안 읽음 | 첫 JSON의 `type`이 `ready`인지 확인한다 |
| 다른 프로세스의 글 알림이 없음 | 소켓 목록이 메모리 | 목록 API로 다시 읽는다 |
| 다운로드 경로에 `..`가 먹힘 | 저장 이름을 원본 경로로 씀 | UUID 이름과 `resolveStored`를 유지한다 |

## ⑥ 직접 해보기

1. 테스트 `final stage covers uploads, payments, mail, ai, oauth, sockets, and mcp` 안에서 소켓 단언이 통과하는지 `npm test`로 본다.
2. 브라우저 개발자도구로 `/ws`가 101인지, 첫 메시지가 `ready`인지 확인한다.
3. 파일을 올린 뒤 저장 이름이 원본 이름과 다른지 응답 JSON에서 확인하고, 그 파일 URL을 로그아웃 상태에서 열면 401 또는 403인지 본다.

## ⑦ ☐ 체크리스트

- ☐ `/ws`가 토큰을 검사하고 `ready`를 보낸다
- ☐ 글 작성 알림은 `post.created`와 아이디만 담는다
- ☐ 알림을 못 받아도 목록 API로 같은 글을 볼 수 있다
- ☐ 파일은 UUID로 저장되고 소유자만 다시 받는다
- ☐ 소켓과 실시간 목록이 한 프로세스 메모리라는 한계를 말했다

## ⑧ 다음 단계

알림과 파일이 붙었다. study18에서는 문서 텍스트를 요약하고, 발췌에 없을 때는 모른다고 말하며, 그 조회를 MCP 도구로도 연다.
