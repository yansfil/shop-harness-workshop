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
| `npm run grade` | 채점기. 규칙 위반을 파일·줄과 함께 보임 |

## 폴더

| 폴더 | 내용 |
| --- | --- |
| `apps/api` | Express 5 API 서버. 하위 지침은 `apps/api/CLAUDE.md` |
| `apps/web` | React+Vite 웹. 하위 지침은 `apps/web/CLAUDE.md` |
| `packages/contracts` | API 요청·응답 스키마(zod)와 경로 |
| `packages/db` | SQLite 연결과 마이그레이션 |
| `packages/shared` | `Money`(정수 원), `Clock`(시간 주입) |
| `tools` | 관찰 도구 |
| `tests` | API 통합 테스트 |
| `docs` | 문서. 규칙은 `docs/rules`, 과제 재료는 `docs/tasks` |
| `data` | 로컬 SQLite 파일(git 제외) |

## 이 레포의 규칙 8개

코드를 고치기 전에 아래 표를 보고, 건드리는 영역의 규칙은 `docs/rules/`의 해당 문서를 먼저 읽습니다.
이유와 좋은 예·나쁜 예가 거기 있습니다.

| # | 규칙 | 문서 |
| --- | --- | --- |
| 1 | 재고 수량은 `InventoryService`만 바꾼다 | `docs/rules/01-inventory-service-only.md` |
| 2 | 금액은 `Money`(정수 원)로만 계산한다 | `docs/rules/02-money-integer-won.md` |
| 3 | 주문 `status`는 orders 도메인의 전이 함수만 바꾼다 | `docs/rules/03-order-status-transition.md` |
| 4 | `new Date()` 대신 주입받은 `Clock`을 쓴다 | `docs/rules/04-clock-injection.md` |
| 5 | 고객 ID는 세션에서만 얻는다. 요청의 `customerId`를 믿지 않는다 | `docs/rules/05-customer-id-from-session.md` |
| 6 | 응답 DTO는 web 계층 mapper만 만든다 | `docs/rules/06-dto-in-web-mapper.md` |
| 7 | 끝내기 전에 `npm run verify`, 기존 테스트의 기대값은 고치지 않는다 | `docs/rules/07-verify-and-fixed-expectations.md` |
| 8 | DB 변경은 새 번호 마이그레이션 파일로, 기존 파일은 고치지 않는다 | `docs/rules/08-new-numbered-migration.md` |

계층(web → application → domain ← infra)과 조립 방식은 `docs/architecture.md`에 있습니다.

## 작업 방식

- 일이 끝났다고 말하기 전에 `npm run verify`를 돌려 통과를 확인합니다.
- 고친 뒤 `npm run grade`로 규칙 위반이 없는지 봅니다.
- 요구가 모호하면 구현 전에 `interview` Skill로 물어서 `prd` Skill로 문서에 적고, 확정된 PRD를 `implement` Skill로 구현합니다.
- 구현이 끝나면 `verifier` 서브에이전트에게 독립 검증을 맡깁니다. 만든 쪽이 스스로 PASS를 선언하지 않습니다.
- 경로별 세부 규칙은 `.claude/rules/`가 해당 파일을 다룰 때 자동으로 읽힙니다.
