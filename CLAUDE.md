# 그랩마켓 실습 레포

가상의 교육용 쇼핑몰 "그랩마켓"의 주문·재고 앱입니다.

## 명령어

| 명령 | 하는 일 |
| --- | --- |
| `npm ci` | 의존성 설치 |
| `npm run dev` | API(127.0.0.1:3001)와 웹(127.0.0.1:5173) 개발 서버 |
| `npm run verify` | Node 24 확인 → 타입 검사 → lint → 테스트 → 빌드 |
| `npm test` | 테스트만 (vitest) |
| `npm run typecheck` | 타입 검사만 |
| `npm run lint` | lint만 |
| `npm run build` | 웹 빌드만 |
| `npm run db:reset` | DB를 지우고 시드로 다시 채움 |
| `npm run orders:simulate` | 몇 초마다 새 주문을 만듦(Ctrl+C로 멈춤) |
| `npm run mcp:db` | 읽기 전용 DB MCP 서버(stdio) |
| `npm run viewer` | 세션 뷰어 |
| `npm run grade` | 채점기 |

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `apps/api` | Express 5 API 서버 |
| `apps/web` | React+Vite 웹 |
| `packages/contracts` | API 요청·응답 스키마(zod)와 경로 |
| `packages/db` | SQLite 연결과 마이그레이션 |
| `packages/shared` | 여러 곳에서 쓰는 작은 모듈 |
| `tools` | 관찰 도구 |
| `tests` | API 통합 테스트 |
| `docs` | 문서 |
| `data` | 로컬 SQLite 파일(git 제외) |

## 지킬 것

채점기(`npm run grade`)가 잡은 실제 위반에서 나온 규칙입니다. 이유와 예시는 `docs/rules/`에 있습니다.

- 계층 import 방향을 지킨다: web → application → domain ← infra. web은 infra·repository를 직접 부르지 않고 service를 부른다(docs/architecture.md).
- 응답 DTO는 web 계층 mapper가 만든다. controller에서 객체 리터럴로 응답을 만들지 않는다.
- `new Date()`를 쓰지 않는다. 주입받은 `Clock`의 `now()`를 쓴다.
- 요청 본문·쿼리·경로의 `customerId`를 읽지 않는다. 고객은 세션에서만 정한다.
- 주문 `status`는 orders 도메인의 전이 함수로만 바꾼다. 직접 대입하지 않는다.
- 기존 테스트의 `expect` 값을 고치지 않는다. 테스트가 깨지면 코드를 고친다.
- 기존 마이그레이션 파일을 고치지 않는다. 스키마 변경은 다음 번호 파일을 새로 만든다.
- 끝내기 전에 `npm run verify`를 돌려 통과를 확인한다.
