# Fastify 학습

Fastify 하나만으로 게시판 API를 만드는 학습 저장소다. 다른 프레임워크와 코드를 섞지 않는다.

Node.js 22.5 이상, npm이 필요하다. 기본 데이터베이스는 `node:sqlite` 파일이다.

```text
copy .env.example .env
npm install
npm run dev
```

브라우저에서 `http://127.0.0.1:3000/` 을 연다. 건강 확인은 `http://127.0.0.1:3000/health` 다. `APP_STAGE=final`이면 문서 화면은 `http://127.0.0.1:3000/api-docs` 다.

| 명령 | 하는 일 |
| --- | --- |
| `npm run dev` | `node --watch src/server.js` |
| `npm start` | 감시 없이 서버 실행 |
| `npm test` | `node:test` |
| `npm run backup` | SQLite 파일을 `data/backups`에 복사 |
| `npm run mcp` | 문서 도구 MCP 프로세스 |
| `npm run example:hello` | study1 예제, 포트 3000 |
| `npm run example:plugins` | study2, 포트 3001 |
| `npm run example:notes` | study3, 포트 3002 |
| `npm run example:routes` | study4, 포트 3003 |
| `npm run example:form` | study5, 포트 3004 |

`APP_STAGE=basic`은 회원과 게시판까지다. `final`은 업로드, 결제, 메일, 문서, 웹소켓, OpenAPI를 더한다.

## 문서

| 파일 | 내용 |
| --- | --- |
| `study0.md` | 설치, 폴더, Git, `.env` |
| `study1.md` | 첫 HTML과 JSON |
| `study2.md` | 앱, 플러그인, 라우트 |
| `study3.md` | 파일과 localStorage |
| `study4.md` | 경로와 오류 형식 |
| `study5.md` | JSON Schema와 중복 제출 |
| `study6.md` | SQLite CRUD |
| `study7.md` | 로그인, 해시, CSRF |
| `study8.md` | 폴더와 환경 분리 |
| `study9.md` | 테스트와 로그 |
| `study10.md` | 배포 개념과 기초 정리 |
| `studymidpoint.md` | 게시판 조립 |
| `study11.md` | DB 엔진 |
| `study12.md` | 화면 모듈 |
| `study13.md` | 업로드, 결제, 메일, OAuth |
| `study14.md` | OpenAPI와 오류 규칙 |
| `study15.md` | 캐시와 큐 |
| `study16.md` | Docker와 Actions |
| `study17.md` | 웹소켓과 파일 |
| `study18.md` | 문서 답변과 MCP |
| `studyfinal.md` | 서비스 점검 |

비밀은 `.env`에만 둔다. `.env.example`은 키 이름만 보여 주는 파일이다.
