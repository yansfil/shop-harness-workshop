# low-stock-alert 구현 계획

PRD: docs/tasks/low-stock-alert.md
기준 브랜치·커밋: day2-a-answers, 70bbb20

## 조사한 것

- `inventory.safety_stock` 컬럼은 `0001_init.sql`에 이미 있다. 시드는 상품마다 값을 넣는다.
- `sqlite-inventory-repository.ts`의 `ITEM_SELECT`가 `safety_stock`을 읽지 않는다. 도메인 `InventoryItem`과 계약 `InventoryItemSchema`에도 필드가 없다.
- 목록·이력·입고 응답은 모두 `toInventoryItemDto` 한 곳을 지나므로 한 군데를 고치면 세 응답이 같이 바뀐다.
- 관리자 재고 화면(`admin-inventory-page.tsx`)은 입고가 끝나면 응답의 `item`으로 행을 바꾼다. 응답에 `lowStock`이 있으면 뱃지와 개수가 따라 바뀐다.
- 화면 테스트는 `src/test/fake-api.ts`의 가짜 서버와 `renderApp`을 쓴다. 재고 화면용 응답은 아직 없다.
- 테스트 DB 시드(`tests/support/test-app.ts`)는 상품 4개의 안전재고가 모두 5이고 수량은 10, 3, 0, 100이다.

## AC별 계획

| AC | 바꿀 파일 | 확인할 테스트·화면 | 비고 |
| --- | --- | --- | --- |
| AC-1 | `packages/contracts/src/inventory.ts`, `inventory/domain/stock.ts`, `sqlite-inventory-repository.ts`, `inventory-mapper.ts` | `tests/inventory.test.ts` 새 케이스 | `lowStock`은 도메인 함수 `isLowStock`이 정하고 mapper가 담는다 |
| AC-2 | 같음 | 경계 값 5 대 5, 5 대 6 | |
| AC-3 | 같음 | 품절 상품 | 시드의 백미(수량 0) |
| AC-4 | 같음 | 입고 응답과 이어진 목록 조회 | 충전기 3개에 3개 입고 |
| AC-5 | `apps/web/src/routes/admin-inventory-page.tsx` | `admin-inventory-page.test.tsx` | 뱃지는 `lowStock`만 읽는다 |
| AC-6 | 같음 | 같은 테스트 | 0개면 알림 줄이 없다 |
| AC-7 | 같음 | 같은 테스트 | 필터는 화면 상태 |
| AC-8 | 같음 | 같은 테스트 | 입고 응답의 `item`으로 행을 바꾸므로 필터가 켜진 채 행이 사라진다 |
| AC-9 | 기존 `tests/inventory.test.ts`, 새 권한 케이스 | `npm run verify` | 기존 기대값은 고치지 않는다 |

## 범위 대조

- PRD 비범위에 닿는 변경: 없음(고객 화면의 "남은 수량 적음"은 건드리지 않는다)
- 새 마이그레이션 필요 여부: 없음(D-4)
- 규칙 8개 중 닿는 것: 2·4·5는 해당 없음. 6(DTO는 web mapper), 7(verify와 고정 기대값)만 닿는다.
