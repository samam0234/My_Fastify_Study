# study7. 인증과 보안 기초

## ① 목표

회원가입과 로그인으로 토큰을 발급하고, 훅으로 인증과 로그를 남기며, 비밀번호 해시와 CORS, XSS, CSRF의 기본 방어를 갖춘다.

## ② 📖 이론

인증은 “누구인가”이고 인가는 “이 글을 고쳐도 되나”이다. 이 서버는 역할 표가 없다. 글과 댓글은 작성자 아이디가 같아야 고칠 수 있다.

로그인 상태를 프론트와 백엔드가 공유하는 방법은 두 갈래다.

- `Authorization: Bearer <토큰>`을 헤더로 보낸다. 화면이 아닌 클라이언트에 맞다.
- `access_token` httpOnly 쿠키를 브라우저가 알아서 보낸다. 스크립트는 이 값을 읽지 못한다.

훅이 요청 시작 시 쿠키가 있고 Authorization이 없으면 쿠키 값을 Bearer 헤더로 복사한 뒤 `jwtVerify`를 한다. 라우트는 어느 쪽에서 왔는지 구분하지 않고 `request.authUser`만 본다. Bearer만 있고 쿠키가 없으면 CSRF 검사는 하지 않는다. 쿠키로 로그인된 브라우저의 안전하지 않은 메서드만 CSRF를 본다.

토큰 페이로드에는 `sub`(사용자 아이디 문자열), `email`, `nickname`, `jti`가 있다. 만료는 `JWT_EXPIRES`, 기본 7일이다. 로그아웃은 `jti`를 `revoked_tokens`에 넣어 만료 전이라도 거절한다.

비밀번호는 scrypt다. 매개변수 `N=16384`, `r=8`, `p=1`, 소금 16바이트, 결과 32바이트다. 저장 형식은 `scrypt$16384$8$1$salt$hash`다. 비교는 `timingSafeEqual`이라 틀린 자리에서 함수가 일찍 반환하지 않는다. 틀린 비밀번호와 없는 이메일은 둘 다 401 `INVALID_CREDENTIALS`, 문장도 같다.

CORS는 `CORS_ORIGIN` 한 곳과 `credentials: true`다. 같은 출처의 `public/` 페이지는 CORS 없이 쿠키를 보낸다. 다른 출처의 프론트만 이 허용 목록이 필요하다.

XSS는 오류 HTML과 화면 글을 넣을 때 이스케이프하고, CSP로 같은 출처 스크립트만 허용한다. CSRF는 `csrf_token` 쿠키(스크립트가 읽을 수 있음)와 `x-csrf-token` 헤더가 같을 때만 쿠키 인증 변경 요청을 통과시킨다. 로그인, 회원가입, 결제 웹훅은 아직 쿠키 세션이 없거나 서버 대 서버라 예외다.

로그인 횟수는 라우트 설정 `rateLimit.max`다. 기본 `LOGIN_RATE_MAX=30`이고 창은 1분이다. 전역 제한은 꺼 두어 목록 조회가 로그인 실패에 묶이지 않는다.

비유하면 JWT는 출입증, `jti` 폐기 목록은 분실 신고, CSRF 헤더는 창구에서 다시 묻는 확인 질문이다. httpOnly 쿠키는 출입증을 손님 손이 아니라 서랍에 넣는 일이다.

## ③ 🛠️ 실기

### 비밀번호

`src/lib/password.js` 전체다.

```js
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { AppError } from '../errors.js'

const N = 16384
const R = 8
const P = 1

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    throw new AppError(400, 'VALIDATION_ERROR', '입력값을 확인하세요.', {
      password: ['8~72자로 입력하세요.']
    })
  }
  const salt = randomBytes(16).toString('base64url')
  const hash = scryptSync(password, salt, 32, { N, r: R, p: P }).toString('base64url')
  return `scrypt$${N}$${R}$${P}$${salt}$${hash}`
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const [algo, n, r, p, salt, hash] = stored.split('$')
  if (algo !== 'scrypt' || Number(n) !== N || Number(r) !== R || Number(p) !== P || !salt || !hash) return false
  const actual = scryptSync(password, salt, 32, { N, r: R, p: P })
  const expected = Buffer.from(hash, 'base64url')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
```

1–6. scrypt 비용 매개변수를 상수로 고정한다. 저장 문자열에도 같은 숫자를 적어 나중에 바꿔도 옛 해시를 알아볼 수 있게 한다.
8–16. 길이가 8~72가 아니면 해시하지 않고 400을 던진다. 소금은 매번 새 16바이트다.
19–26. 형식이 다르면 `false`다. 길이도 비교한 뒤 `timingSafeEqual`을 쓴다. 호출자는 `false`와 없는 사용자를 같은 401로 합친다.

### 쿠키

```js
export function setAuthCookies(reply, config, token) {
  const csrf = randomUUID()
  const base = baseOptions(config)
  reply.setCookie('access_token', token, { ...base, httpOnly: true, maxAge: 60 * 60 * 24 * 7 })
  reply.setCookie('csrf_token', csrf, { ...base, httpOnly: false, maxAge: 60 * 60 * 24 * 7 })
  return csrf
}
```

1. `baseOptions`는 `path: '/'`, `sameSite: 'lax'`, `secure: config.cookieSecure`다.
2. 접근 토큰만 `httpOnly: true`다.
3. CSRF 쿠키는 스크립트가 읽어 헤더로 다시 보내야 하므로 `httpOnly: false`다.
4. 로컬 HTTP에서는 `COOKIE_SECURE=false`가 아니면 브라우저가 쿠키를 거절한다.

### 훅

`src/plugins/auth.js`의 요청 훅과 응답 훅이다.

```js
app.decorateRequest('authUser', null)
app.addHook('onRequest', async (request) => {
  if (!request.headers.authorization && request.cookies?.access_token) {
    request.headers.authorization = `Bearer ${request.cookies.access_token}`
  }
  if (!request.headers.authorization) return
  try {
    const payload = await request.jwtVerify()
    if (!payload?.jti || await app.repo.isTokenRevoked(payload.jti)) {
      throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
    }
    request.authUser = {
      id: Number(payload.sub),
      email: payload.email,
      nickname: payload.nickname,
      jti: payload.jti,
      exp: payload.exp
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
  }
})
app.addHook('onResponse', async (request, reply) => {
  request.log.info({ statusCode: reply.statusCode, userId: request.authUser?.id ?? null }, '요청을 마쳤습니다.')
})
```

1. `decorateRequest`의 기본값 `null`은 “아직 로그인하지 않음”이다.
2. 쿠키를 Bearer로 복사하는 브리지가 jwt 플러그인의 cookie 옵션 대신 있다. 순서가 코드에 보인다.
3. `jti`가 없거나 폐기 목록에 있으면 401이다.
4. 서명 실패, 만료도 같은 401 문장이다. 이유를 세분하지 않는다.
5. `onResponse`는 상태 코드와 사용자 아이디만 로그한다. 토큰 원문은 `src/server.js`의 pino `redact`가 `authorization`과 `cookie` 헤더를 `[redacted]`로 가린다.

`requireAuth`는 `preValidation`에 붙인다. `request.authUser`가 없으면 401이다. 이 훅은 JSON Schema 검증보다 먼저라서, 토큰 없이 잘못된 본문을 보내면 400이 아니라 401이다. 잘못된 JSON은 파싱 단계라 그 이전이고 400 `BAD_REQUEST`다.

CSRF 훅은 `installCsrf`다. GET, HEAD, OPTIONS는 통과다. 예외 경로는 `/api/auth/login`, `/api/auth/signup`, `/api/payments/webhook`다. `access_token` 쿠키가 있을 때만 헤더와 쿠키를 `tokenEqual`로 비교한다. 다르면 403 `FORBIDDEN`이다.

### 라우트

`src/routes/auth.js`의 네 창구다.

- `POST /api/auth/signup`는 201과 `{ data: 사용자 }`다. 이메일은 trim 후 소문자다. 중복은 409 `EMAIL_TAKEN`이다.
- `POST /api/auth/login`은 200 `{ data: { user, accessToken } }`와 쿠키 두 개다. 실패는 401 `INVALID_CREDENTIALS`다.
- `POST /api/auth/logout`은 인증 필수, `jti` 폐기, 쿠키 삭제, 204다.
- `GET /api/auth/me`는 인증 필수, DB에서 다시 읽어 `{ data: 사용자 }`다. 사용자가 지워졌으면 401이다.

헬멧은 `contentSecurityPolicy: false`로 두고, `onRequest`에서 문서 경로에만 CSP를 직접 붙인다. `/api-docs`는 Swagger UI 자산 때문에 이 CSP를 건너뛴다. 스크립트는 `'self'`만 허용하므로 외부 스크립트 삽입은 브라우저가 막는다. 화면이 글을 그릴 때도 문자열을 텍스트 노드로 넣는다.

## ④ 🔗 연동 포인트

로그인 응답의 `accessToken`은 API 클라이언트가 저장해 Bearer로 보낸다. 브라우저는 그 값을 `localStorage`에 넣지 않고 httpOnly 쿠키에 둔다. `public/js/api.js`는 `credentials: 'include'`와 `x-csrf-token`만 붙이면 같은 출처 화면이 로그인 상태를 유지한다.

study6의 `ownPost`는 `request.authUser.id`와 `post.author.id`를 비교한다. 인증 훅이 없으면 그 비교는 항상 실패한다.

CORS 허용 출처는 `.env`의 `CORS_ORIGIN`이다. 기본 `http://localhost:5173`은 다른 포트의 화면을 위한 값이고, 이 저장소의 게시판 화면은 Fastify가 `public/`을 직접 제공한다.

로그아웃한 토큰은 만료 시각까지 `revoked_tokens`에 남는다. 폐기 시각은 페이로드 `exp`를 밀리초 없는 ISO로 바꾼 값이다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 로그인 200인데 다음 요청이 401 | `COOKIE_SECURE=true`인데 주소가 http | 로컬은 `COOKIE_SECURE=false` |
| 쿠키 로그인 후 POST가 403 | `x-csrf-token`이 없거나 다름 | `csrf_token` 쿠키를 읽어 같은 값의 헤더를 보낸다 |
| Bearer만 쓰는데 403 | CSRF를 모든 인증에 적용함 | 이 서버는 `access_token` 쿠키가 있을 때만 CSRF를 본다 |
| 맞는 비밀번호인데 401 | 이메일의 대소문자 또는 앞뒤 공백 | 서버가 소문자로 저장한다. 요청도 trim 된다 |
| 로그아웃 후에도 토큰이 유효 | `jti`를 폐기하지 않음 | `revokeToken` 행을 확인하고 훅의 폐기 검사를 탄다 |
| 로그에 JWT가 보임 | redact 경로 누락 | `req.headers.authorization`과 `req.headers.cookie`를 가린다 |
| 로그인만 하면 429 | `LOGIN_RATE_MAX`가 너무 작거나 실패가 쌓임 | 1분 창이 지나면 다시 허용된다. 테스트는 한도를 올려 둔다 |

## ⑥ 직접 해보기

1. 회원가입과 로그인을 하고 `Set-Cookie`에 `access_token`이 HttpOnly인지, `csrf_token`은 아닌지 본다.
2. 쿠키만으로 `GET /api/auth/me`가 200인지, 로그아웃 뒤 같은 쿠키가 401인지 확인한다.
3. 쿠키가 있는 상태에서 CSRF 헤더 없이 글을 쓰면 403인지, 헤더를 더하면 201인지 본다.

## ⑦ ☐ 체크리스트

- ☐ 훅(hooks)으로 인증, 로깅
- ☐ 회원가입 201, 로그인 200, 로그아웃 204, 내 정보 200이 된다
- ☐ 비밀번호가 scrypt 문자열로 저장되고 평문은 응답에 없다
- ☐ 없는 이메일과 틀린 비밀번호의 401 문장이 같다
- ☐ httpOnly 쿠키와 Bearer가 같은 `request.authUser`가 된다
- ☐ 쿠키 인증의 변경 요청은 CSRF 헤더가 없으면 403이다
- ☐ CORS 출처와 쿠키 `secure`가 환경변수로 분리되어 있다
- ☐ 오류 HTML과 CSP가 스크립트 삽입을 그대로 실행하지 않는다
- ☐ 로그아웃한 `jti`는 만료 전에도 401이다

## ⑧ 다음 단계

인증이 라우트 밖에 모였다. study8에서는 설정, 공용 함수, 폴더를 나눠 개발과 운영이 같은 코드를 다른 환경변수로 쓰게 정리한다.
