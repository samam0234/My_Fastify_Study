# study16. 운영과 CI/CD

## ① 목표

Docker로 같은 앱을 띄우고, GitHub Actions에서 테스트와 이미지 빌드를 돌리며, 로그와 SQLite 백업을 점검표로 확인한다.

## ② 📖 이론

운영은 “내 컴퓨터에서 된다”를 “같은 명령이 다른 컴퓨터에서 된다”로 바꾸는 일이다. 이미지는 Node 24와 `npm ci --omit=dev`와 `src/`를 묶는다. 소스만 보내고 이미지 안에서 설치한다.

자동 배포는 테스트가 통과한 뒤에만 의미가 있다. 워크플로는 푸시와 풀 리퀘스트마다 테스트를 돌리고 이미지를 빌드한다. 실제 서버에 올리는 잡은 `DEPLOY_ENABLED` 변수가 참일 때만 실행되고, 지금은 그 사실을 출력하는 자리만 있다. 호스트 비밀을 워크플로 파일에 적지 않는다.

로그는 pino다. 요청마다 상태 코드와 사용자 아이디가 남고, 인증 헤더는 가려진다. 500만 스택을 로그에 남긴다. 수집기로 보내기 전에 이 한 줄이 요청 아이디와 맞아야 한다.

백업은 `scripts/backup.js`가 SQLite 파일을 `data/backups/board-YYYY-MM-DD.db`로 복사한다. 메모리 데이터베이스와 SQLite가 아닌 엔진은 이 스크립트가 거절한다. 그날의 파일을 같은 이름으로 다시 복사하면 덮어쓴다.

비유하면 Dockerfile은 포장 상자, Actions는 포장 전에 흔들어 보는 검사대, 백업은 창고 열쇠의 여벌이다. 검사대 없이 상자를 부치지 않는다.

## ③ 🛠️ 실기

`Dockerfile` 전체다.

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data/uploads /data/outbox && chown -R node:node /app /data
USER node
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SQLITE_PATH=/data/board.db
ENV UPLOAD_DIR=/data/uploads
ENV OUTBOX_DIR=/data/outbox
EXPOSE 3000
CMD ["node", "src/server.js"]
```

1. 베이스는 Node 24다. 로컬 학습 버전과 메이저가 같다.
2. 잠금 파일을 먼저 복사해 의존성 층이 소스 수정 때마다 깨지지 않게 한다.
3. `npm ci --omit=dev`는 테스트용 `ws`를 이미지에 넣지 않는다.
4. `USER node`로 루트가 아닌 사용자로 듣는다.
5. `HOST=0.0.0.0`이어야 컨테이너 밖에서 포트가 보인다.
6. 데이터 경로는 `/data`다. compose가 이 경로를 볼륨 `board-data`에 붙인다.

compose의 앱은 `JWT_SECRET`이 없으면 기동을 거부한다. `${JWT_SECRET:?Set JWT_SECRET}`다. 로컬 HTTP 점검을 위해 `COOKIE_SECURE`는 `false`다. Postgres, MariaDB, MongoDB는 프로파일이라 `docker compose up`만으로는 뜨지 않는다.

워크플로 `.github/workflows/ci.yml`의 잡은 세 개다.

1. `test`. Node 24, `npm ci`, `npm test`.
2. `docker`. `docker build -t fastify-study .`
3. `deploy`. `vars.DEPLOY_ENABLED`가 `'true'`일 때만, test와 docker 뒤에 실행된다. 실제 호스트 명령은 비밀을 설정한 뒤에 넣는다.

백업 명령은 `npm run backup`이다. 서버를 잠시 멈추거나 복사 도구가 허용하는 시점에 실행한다. WAL 모드라 복사 한 장이 최신 커밋 직전과 어긋날 수 있다. 학습용 복사본이고, 운영에서 더 강한 보장이 필요하면 SQLite 백업 API나 SQL 덤프로 이 스크립트 자리를 바꾼다.

운영 점검표다.

- ☐ 이미지 빌드가 로컬 또는 Actions에서 끝난다
- ☐ 컨테이너에 `JWT_SECRET`이 있고 개발용 상수가 아니다
- ☐ `/data` 볼륨을 지워도 되는지 확인한 뒤에만 볼륨을 삭제한다
- ☐ `GET /health`가 컨테이너 포트에서 200이다
- ☐ 로그에 `authorization` 원문이 없고 `x-request-id`로 500을 찾을 수 있다
- ☐ `npm run backup`이 `data/backups/board-날짜.db`를 만든다
- ☐ `DEPLOY_ENABLED`를 켜기 전에 배포 잡의 명령과 비밀 이름을 정한다
- ☐ `.env`와 백업 파일이 Git에 들어가지 않는다

## ④ 🔗 연동 포인트

이미지의 `SQLITE_PATH=/data/board.db`가 study10에서 말한 “재시작 후에도 남는 디스크”다. compose 볼륨이 그 디스크다. 환경변수 `JWT_SECRET`은 호스트 셸에서 컨테이너로 넘어간다.

Actions의 `npm test`는 study9의 메모리 SQLite 테스트다. 이미지 빌드는 그 테스트와 별도로 패키지가 설치되는지만 본다. 배포 잡은 둘 다 성공해야 순서가 온다.

로그의 사용자 아이디는 인증 훅의 `onResponse`다. 수집기를 붙이면 이 JSON 줄을 그대로 보낸다. 요청 아이디는 앱이 `x-request-id`로 이미 응답에 넣고 있다.

## ⑤ 오류 노트

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| compose가 `Set JWT_SECRET`에서 멈춤 | 비밀 미설정 | 셸에 16자 이상을 넣고 다시 올린다 |
| 컨테이너는 떠 있는데 접속 거부 | `HOST`가 127.0.0.1 | 이미지 기본은 `0.0.0.0`이다. 덮어쓰지 않는다 |
| 재시작 후 DB가 빔 | 볼륨 없이 컨테이너 안에만 저장 | `board-data`가 `/data`에 붙어 있는지 본다 |
| `npm run backup`이 거절 | 메모리 DB거나 sqlite가 아님 | 파일 SQLite에서만 복사한다 |
| Actions deploy가 항상 생략 | 변수가 꺼져 있음 | 저장소 변수 `DEPLOY_ENABLED`가 참일 때만 돈다 |
| 이미지에 개발 의존성이 필요해 실패 | 런타임이 `ws`를 import | 서버 런타임은 `ws`를 import하지 않는다. 웹소켓 테스트만 개발 의존성이다 |

## ⑥ 직접 해보기

1. Docker가 있으면 `docker build -t fastify-study .`까지 실행한다. 없으면 워크플로 파일에서 test와 docker 잡의 순서를 읽고 막힌 도구를 적는다.
2. 파일 SQLite에 글이 있는 상태에서 `npm run backup`을 실행해 백업 경로를 확인한다.
3. 서버 로그에서 로그인 요청의 헤더가 `[redacted]`인지 본다.

## ⑦ ☐ 체크리스트

- ☐ Dockerfile이 `npm ci`와 `USER node`와 `/data`를 사용한다
- ☐ compose가 비밀 없이 앱을 시작하지 않는다
- ☐ GitHub Actions가 테스트와 이미지 빌드를 푸시마다 돌린다
- ☐ 배포 잡은 변수로 꺼 두고 비밀을 파일에 적지 않았다
- ☐ 로그 가림과 SQLite 백업 명령을 한 번씩 확인했다
- ☐ 운영 점검표를 환경에 맞게 표시했다

## ⑧ 다음 단계

프로세스와 이미지와 백업이 있다. study17에서는 그 프로세스에 웹소켓 알림과 파일 처리를 붙여 요청-응답 밖의 기능을 연다.
