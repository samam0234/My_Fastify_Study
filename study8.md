# study8. 구조화와 재사용

## ① 목표

폴더와 공용 모듈을 나누고, 환경변수로 개발과 운영 설정을 갈라 같은 앱 공장을 두 번 쓰지 않는다.

## ② 📖 이론

한 파일이 라우트, SQL, 비밀번호, 쿠키를 같이 알면 고칠 때마다 옆 기능이 깨진다. 이 저장소는 아는 것을 폴더로 가른다.

| 폴더 | 아는 것 | 몰라야 하는 것 |
| --- | --- | --- |
| `src/routes` | 경로, 상태 코드, 스키마 | SQL 문장 |
| `src/plugins` | 앱에 설비를 끼우는 순서 | 화면 HTML |
| `src/db` | 표와 쿼리 | HTTP 헤더 |
| `src/lib` | 순수에 가까운 함수 | 전역 앱 상태 |
| `src/config.js` | 환경변수 해석 | 라우트 |
| `public` | 화면과 `fetch` | 비밀 키 |

`buildApp(options)` 하나가 테스트, 개발 서버, 운영 프로세스를 만든다. 차이는 옵션과 환경변수뿐이다. `skipEnvFile`이면 `.env`를 읽지 않아 테스트가 개발자 PC의 Postgres 주소에 붙지 않는다.

개발과 운영을 가르는 값이다.

| 값 | 개발 | 운영 |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` |
| `JWT_SECRET` | 비어 있으면 개발용 상수 | 16자 이상이고 개발용 상수면 기동 실패 |
| `COOKIE_SECURE` | 보통 `false` | 기본 `true` |
| `HOST` | `127.0.0.1` | 컨테이너에서는 `0.0.0.0` |
| `APP_STAGE` | 학습 중 `basic` 또는 `final` | 배포하는 기능 집합 |
| 로거 | `server.js`가 pino를 넘김 | 같은 코드, 로그 수집만 다름 |

`loadDotEnv`는 이미 있는 셸 변수를 덮지 않는다. 운영 플랫폼이 넣은 `JWT_SECRET`이 파일보다 우선이다.

중복을 줄이는 자리는 `errorBody`, `parseListQuery`, `presentPost`, `withIdempotency`, `requireAuth`다. 라우트마다 404 문장을 새로 만들지 않고 `AppError` 한 클래스를 던진다.

비유하면 `buildApp`은 같은 도면이고 `.env`는 그 건물을 어느 도시에 짓는지 적는 표다. 도면을 개발용, 운영용으로 복사하지 않는다.

## ③ 🛠️ 실기

`resolveConfig`가 거절하는 운영 조건이다.

```js
const jwtSecret = overrides.jwtSecret ?? process.env.JWT_SECRET ?? (nodeEnv === 'production' ? '' : DEV_JWT_SECRET)
if (!jwtSecret || jwtSecret.length < 16) {
  throw new Error('JWT_SECRET가 없거나 16자보다 짧습니다.')
}
if (nodeEnv === 'production' && jwtSecret === DEV_JWT_SECRET) {
  throw new Error('운영 환경에서는 개발용 JWT_SECRET을 쓸 수 없습니다.')
}
```

1. 함수 인자, 환경변수, 개발 기본값 순이다. 운영은 기본값이 빈 문자열이라 곧 길이 검사에서 실패한다.
2. 개발용 상수 `dev-only-change-me-please-32chars`는 저장소에 있어도 운영 기동을 통과하지 못한다.
3. `usingDevSecret`이 참이면 `server.js`가 경고 로그만 남기고 개발 서버는 계속 뜬다.

불리언은 `readBool`만 통과한다. `true`와 `false` 문자열, 진짜 불리언만 받고 다른 글자는 기동을 멈춘다. `COOKIE_SECURE`의 기본은 “운영이면 참”이다. 인자가 명시되면 환경변수보다 인자가 이긴다. 테스트가 `cookieSecure: false`를 넘길 수 있는 이유다.

스테이지 분기는 `src/app.js` 한곳에만 있다.

```js
if (config.stage === 'final') await app.register(swaggerPlugin)
await app.register(healthRoutes)
await app.register(authRoutes)
await app.register(postRoutes)
await app.register(commentRoutes)
if (config.stage === 'final') {
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } })
  await app.register(uploadRoutes)
  await app.register(paymentRoutes)
  await app.register(mailRoutes)
  await app.register(aiRoutes)
  await app.register(oauthRoutes)
  await app.register(realtimeRoutes)
  await app.register(swaggerUiPlugin)
}
```

1. `basic`은 건강, 인증, 글, 댓글, 그 다음의 정적 화면까지다.
2. `final`만 업로드와 그 이후를 등록한다.
3. 라우트 파일이 스테이지를 스스로 `listen`하지 않는다. 등록 여부는 앱 공장이 결정한다.

공용 함수를 두는 기준이다.

- HTTP를 몰라도 되면 `src/lib`다. 비밀번호, 시간, 서명, 검색 토큰이 여기 있다.
- 요청과 응답을 알면 `src/plugins`나 `src/routes`다.
- SQL을 알면 `src/db`다.
- 테스트만 쓰는 앱 조립은 `tests/helpers.js`의 `createTestApp`이다. 여기서 `skipEnvFile: true`, `sqlitePath: ':memory:'`, 짧은 수명의 업로드 폴더를 고정한다.

`createTestApp`이 `onClose`에서 임시 폴더를 지운다. 개발 서버의 `data/`는 지우지 않는다. 수명이 다른 데이터를 같은 삭제 함수에 넣지 않기 위해서다.

## ④ 🔗 연동 포인트

개발은 `.env`와 `npm run dev`다. 운영은 프로세스 환경변수와 `npm start` 또는 컨테이너의 `ENV`다. 둘 다 `resolveConfig` → `buildApp` → `listen`이다.

study10의 배포 점검과 study16의 Docker는 이 표의 운영 열을 채우는 일이다. `HOST=0.0.0.0`, `SQLITE_PATH=/data/board.db`, `COOKIE_SECURE`를 주소 체계에 맞추면 된다.

`APP_STAGE=basic`으로 띄우면 study0~10과 midpoint가 약속한 기능만 열린다. `/api/ai/documents`는 404다. `final`은 심화 라우트를 더한다. 테스트는 스테이지를 인자로 넘겨 두 세계를 따로 검증한다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| 테스트가 개발 DB를 지움 | `skipEnvFile` 없이 `.env`의 `DATABASE_URL`을 읽음 | 테스트 헬퍼는 `skipEnvFile: true`와 sqlite 메모리만 쓴다 |
| `APP_STAGE=prod`에서 기동 실패 | 허용 값이 `basic`과 `final`뿐 | 기능 집합과 `NODE_ENV`를 섞지 않는다 |
| `COOKIE_SECURE=yes`에서 기동 실패 | `readBool`이 yes를 모름 | `true` 또는 `false`만 쓴다 |
| 라우트에서 `app.repo`가 없음 | db 플러그인을 `fp` 없이 등록 | `fastify-plugin`으로 부모에 장식을 노출한다 |
| 같은 검증을 라우트마다 복사 | 스키마를 핸들러 안에 둠 | `src/schemas.js`로 모으고 라우트는 이름만 참조한다 |
| 운영에서 개발 비밀로 기동 | `NODE_ENV`를 빼먹음 | 운영 프로세스는 `NODE_ENV=production`을 명시한다 |

## ⑥ 직접 해보기

1. `APP_STAGE=basic`으로 띄워 `/api/posts`는 되고 `/api/ai/documents`는 404인지 확인한 뒤 `final`로 되돌린다.
2. `NODE_ENV=production`과 16자 미만 비밀로 `npm start`가 기동 전에 끝나는지 본다. 끝나면 개발 값으로 되돌린다.
3. `src/routes` 안에서 `SELECT` 문자열이 없는지, SQL은 `src/db`에만 있는지 검색해 본다.

## ⑦ ☐ 체크리스트

- ☐ 라우트, 플러그인, DB, lib, 화면 폴더의 책임이 나뉘어 있다
- ☐ `buildApp` 하나를 테스트와 서버가 같이 쓴다
- ☐ `.env`와 셸 환경변수가 설정의 출처이고 코드의 기본 비밀은 운영에서 거부된다
- ☐ `basic`과 `final`이 등록하는 라우트가 다르다
- ☐ 테스트가 `skipEnvFile`로 개발자 `.env`와 분리된다
- ☐ 오류 본문, 목록 쿼리, 인증 훅을 라우트마다 다시 쓰지 않는다

## ⑧ 다음 단계

구조가 한 공장으로 모였다. study9에서는 그 공장을 테스트로 부르고, 로그와 자주 나는 오류로 실패를 읽는다.
