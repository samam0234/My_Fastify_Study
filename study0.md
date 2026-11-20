# study0. 환경 설정

## ① 목표

Node.js 22.5 이상에 Fastify 5 프로젝트를 올리고, Git과 `.env`까지 갖춘 뒤 개발 서버를 띄운다.

## ② 📖 이론

Fastify는 Node.js 위에서 동작하는 HTTP 서버 프레임워크다. 요청이 들어오면 라우트가 함수를 고르고, 그 함수가 응답을 만든다. 이 저장소는 그 한 가지 도구만으로 게시판 API를 만든다.

왜 이 단계가 먼저인가. 버전이 다르면 `node:sqlite`가 없고, 환경변수를 코드에 적으면 비밀이 저장소에 남는다. 폴더를 정해 두지 않으면 뒤 단계의 플러그인과 라우트를 어디에 둘지 매번 흔들린다.

핵심 용어는 이 저장소 안에서 이렇게 쓴다.

| 용어 | 이 저장소에서의 뜻 |
| --- | --- |
| 앱 | `buildApp()`이 돌려주는 Fastify 인스턴스. 서버 한 대다. |
| 라우트 | `GET /health`처럼 메서드와 경로에 함수를 붙인 것. |
| 플러그인 | `register`로 넣는 기능 묶음. 데이터베이스, 인증, 정적 파일이 여기 있다. |
| 훅 | 요청 앞뒤(`onRequest`, `preValidation`, `onResponse`)에 끼우는 함수. |
| 스키마 | JSON Schema. 본문·쿼리·응답의 모양을 선언한다. |
| 캡슐화 | 플러그인 안의 `decorate`는 기본적으로 그 플러그인 밖으로 새지 않는다. 밖으로 내보내려면 `fastify-plugin`으로 감싼다. |
| 요청 / 응답 | `request`와 `reply`. 헤더, 본문, 상태 코드가 여기 있다. |
| 스테이지 | `APP_STAGE=basic`은 게시판까지, `final`은 업로드·메일·AI·문서까지 연다. |

비유하면 앱은 건물, 라우트는 방 문패, 플러그인은 전기와 수도처럼 여러 방이 같이 쓰는 설비다. 훅은 현관에서 출입 기록을 남기는 절차다.

에디터에는 REST Client, Prettier, DotENV 확장을 권한다. REST Client로 `examples/board.http`를 보내고, Prettier로 저장 형식을 맞추고, DotENV로 `.env` 키를 알아보기 쉽게 본다.

## ③ 🛠️ 실기

### 버전 확인과 설치

```text
node -v
npm -v
npm install
npm run dev
```

1. `node -v`는 `v22.5.0` 이상이어야 한다. `src/server.js`가 그보다 낮으면 프로세스를 끝낸다. 이 학습은 `node:sqlite`의 `DatabaseSync`를 쓰기 때문이다.
2. `npm -v`는 패키지 관리자 버전만 확인한다. 설치 자체는 Node에 묶여 있다.
3. `npm install`은 `package.json`과 `package-lock.json`을 읽고 `node_modules`를 만든다.
4. `npm run dev`는 `node --watch src/server.js`다. 파일을 저장하면 프로세스가 다시 뜬다.

운영처럼 한 번만 띄울 때는 `npm start`(`node src/server.js`)를 쓴다. 테스트는 `npm test`(`node --test`)다.

### 프로젝트 생성에 해당하는 선언

이 저장소는 이미 `package.json`을 갖고 있다. 같은 선언을 새로 만든다면 `npm init -y` 뒤에 `"type": "module"`과 `"engines"`를 넣는다. 현재 파일은 아래와 같다.

```json
{
  "name": "fastify-study",
  "version": "1.0.0",
  "private": true,
  "description": "Fastify 하나만으로 익히는 게시판 API 학습 저장소",
  "type": "module",
  "engines": {
    "node": ">=22.5"
  },
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test",
    "backup": "node scripts/backup.js",
    "mcp": "node src/mcp/server.js",
    "example:hello": "node examples/study1/server.js",
    "example:plugins": "node examples/study2/server.js",
    "example:notes": "node examples/study3/server.js",
    "example:routes": "node examples/study4/server.js",
    "example:form": "node examples/study5/server.js"
  }
}
```

줄별 의미는 다음과 같다.

1. `name`은 패키지 이름이다. `private: true`라서 공개 레지스트리에 올리지 않는다.
2. `type: module`이 있어야 `import`를 쓸 수 있다.
3. `engines.node`는 22.5 미만을 거절하겠다는 선언이다. npm이 경고하고, `src/server.js`가 실제로 종료한다.
4. `start`는 감시 없이 한 프로세스만 띄운다.
5. `dev`의 `--watch`가 개발 서버의 자동 재시작이다.
6. `example:*`는 기초 구간의 작은 서버다. 게시판 앱과 포트를 나눠 쓴다.

### 폴더 구조

```text
src/server.js          프로세스 시작, 시그널, listen
src/app.js             buildApp. 플러그인과 라우트 조립
src/config.js          .env를 읽고 설정 객체로 만든다
src/plugins/           db, auth, errors, docs
src/routes/            health, auth, posts, comments, 이후 단계의 확장
src/db/                sqlite, postgres, mariadb, mongodb 저장소
src/lib/               비밀번호, 시간, 캐시, 큐, 파일
src/mcp/               표준입출력 MCP 서버와 클라이언트
public/                같은 출처의 게시판 화면
examples/study1~5      기초 예제 서버
examples/study11       ORM 참고 스키마
tests/                 node:test
scripts/backup.js      SQLite 파일 복사
```

`data/`는 실행 중에 생긴다. Git에는 넣지 않는다.

### 버전 가드

`src/server.js`의 앞부분이다.

```js
const [major, minor] = process.versions.node.split('.').map(Number)
if (major < 22 || (major === 22 && minor < 5)) {
  console.error('Node.js 22.5 이상이 필요합니다. 현재 버전:', process.versions.node)
  process.exit(1)
}
```

1. `process.versions.node`를 점 기준으로 잘라 숫자로 만든다.
2. 주 버전이 22보다 작거나, 22이면서 부 버전이 5보다 작으면 메시지를 찍고 종료 코드 1로 끝낸다.
3. 이 검사를 `listen`보다 앞에 두어, 반쯤 뜬 서버가 남지 않게 한다.

### Git과 무시 목록

저장소가 없으면 프로젝트 루트에서 `git init`을 한다. 원격이 있다면 `git remote add origin <url>`로 잇는다. 이 학습 저장소는 이미 `origin`이 있다.

`.gitignore` 전체다.

```gitignore
node_modules/
.env
.env.*
!.env.example
data/
coverage/
dist/
*.log
npm-debug.log*
.DS_Store
Thumbs.db
```

1. `node_modules/`는 설치 결과라 커밋하지 않는다.
2. `.env`와 `.env.*`는 비밀과 로컬 값이다.
3. `!.env.example`은 바로 위 규칙의 예외다. 예시 파일만 남긴다.
4. `data/`는 SQLite, 업로드, 메일 보관함이다.
5. `coverage/`, `dist/`, 로그, OS 잡파일은 실행 부산물이다.

### 환경변수 파일

`.env.example`을 복사한다.

```text
copy .env.example .env
```

예시의 핵심 줄은 다음과 같다.

```text
NODE_ENV=development
APP_STAGE=final
HOST=127.0.0.1
PORT=3000
JWT_SECRET=replace-with-a-long-random-string
DB_CLIENT=sqlite
SQLITE_PATH=./data/board.db
COOKIE_SECURE=false
```

1. `NODE_ENV=development`이면 비밀이 없을 때 개발용 JWT 비밀을 쓴다. `production`에서는 그 개발용 값을 거부한다.
2. `APP_STAGE=final`이 기본이다. 기초 게시판만 보려면 `basic`으로 바꾼다.
3. `HOST=127.0.0.1`은 이 컴퓨터에서만 받는다. 컨테이너에서는 `0.0.0.0`이 된다.
4. `JWT_SECRET`은 16자 이상이다. 예시 문자열은 로컬용이고, 운영 값은 따로 만든다.
5. `DB_CLIENT=sqlite`와 `SQLITE_PATH`가 기본 데이터베이스다. 다른 엔진은 study11에서 연다.
6. `COOKIE_SECURE=false`는 `http://127.0.0.1`에서 쿠키를 받기 위한 값이다. HTTPS 운영에서는 `true`다.

`src/config.js`의 `loadDotEnv`는 이미 셸에 같은 이름이 있으면 파일을 덮어쓰지 않는다. 테스트는 `skipEnvFile: true`로 이 파일을 읽지 않는다.

### 에디터 확장

`.vscode/extensions.json` 전체다.

```json
{
  "recommendations": [
    "humao.rest-client",
    "esbenp.prettier-vscode",
    "mikestead.dotenv"
  ]
}
```

1. `humao.rest-client`는 `.http` 파일에서 요청을 보낸다.
2. `esbenp.prettier-vscode`는 저장 시 형식을 맞춘다.
3. `mikestead.dotenv`는 `.env`를 문법 강조한다.

## ④ 🔗 연동 포인트

이 단계의 결과는 다음 단계가 바로 쓰는 세 가지다.

- Git 루트와 `.gitignore`가 있어서 이후 커밋에 `node_modules`, `.env`, `data/`가 섞이지 않는다.
- `.env`의 `PORT`, `JWT_SECRET`, `DB_CLIENT`를 `resolveConfig()`가 객체로 만든다. study6의 DB와 study7의 토큰이 이 객체를 읽는다.
- `npm run dev`의 자동 재시작이 study1의 첫 응답을 고칠 때의 확인 루프다.

`APP_STAGE`는 이후 모든 라우트 조립을 가른다. `basic`은 건강 확인, 회원, 글, 댓글, 화면, 보안 헤더까지다. `final`은 그 위에 업로드, 결제, 메일, AI, 소셜 로그인 시뮬레이터, 웹소켓, OpenAPI를 얹는다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `Node.js 22.5 이상이 필요합니다` 후 종료 | Node가 오래됨 | 22.5 이상으로 올리고 `node -v`를 다시 본다 |
| `JWT_SECRET가 없거나 16자보다 짧습니다` | `.env`의 비밀이 짧거나 비어 있고 `NODE_ENV=production` | 16자 이상의 무작위 문자열을 넣는다 |
| `운영 환경에서는 개발용 JWT_SECRET을 쓸 수 없습니다` | 운영인데 코드에 있는 개발용 비밀을 그대로 씀 | 운영 비밀을 환경변수로만 넣는다 |
| `EADDRINUSE` | 3000 포트를 이미 쓰는 프로세스가 있음 | 그 프로세스를 끄거나 `PORT`를 바꾼다 |
| `ExperimentalWarning: SQLite` | `node:sqlite`가 아직 실험 API | 동작에는 문제 없다. 경고를 오류로 보지 않는다 |
| `.env`를 바꿨는데 반영이 안 됨 | 셸에 같은 변수가 이미 있음 | 셸 변수를 지우거나 프로세스를 새로 연다. 파일은 빈 값만 채운다 |

## ⑥ 직접 해보기

1. `node -v`와 `npm -v`를 적고, `npm install` 뒤 `npm run dev`로 `http://127.0.0.1:3000/health`가 JSON을 주는지 본다.
2. `.env`의 `PORT`를 `3010`으로 바꾸고 저장한다. `--watch`가 다시 뜬 뒤 새 포트의 `/health`만 답하는지 확인한다.
3. `.env`를 `git status`에 나오지 않게 한다. 나온다면 `.gitignore`의 `.env` 줄이 빠지지 않았는지 본다.

## ⑦ ☐ 체크리스트

- ☐ `node -v`가 22.5 이상이다
- ☐ `npm -v`로 패키지 관리자 버전을 확인했다
- ☐ `npm install`로 `node_modules`를 만들었다
- ☐ `package.json`의 `type`이 `module`이고 `engines.node`가 `>=22.5`다
- ☐ 폴더가 `src`, `public`, `examples`, `tests`로 나뉘어 있다
- ☐ `npm run dev`로 개발 서버가 뜨고, 저장하면 다시 시작된다
- ☐ REST Client, Prettier, DotENV 확장을 설치하거나 권장 목록을 확인했다
- ☐ 라우트, 플러그인, 훅, 스키마, 캡슐화라는 말을 이 저장소 기준으로 설명할 수 있다
- ☐ `git init`과 원격 `origin`이 연결되어 있다
- ☐ `.gitignore`가 `node_modules`, `.env`, `data/`를 무시하고 `.env.example`은 남긴다
- ☐ `.env.example`을 `.env`로 복사했고, 비밀은 16자 이상이다

## ⑧ 다음 단계

서버가 뜬다. study1에서는 그 프로세스 안에 첫 HTML과 첫 JSON을 직접 만들고, 브라우저 개발자도구로 상태 코드를 확인한다.
