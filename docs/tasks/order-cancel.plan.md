# order-cancel 구현 계획

PRD: docs/tasks/order-cancel.md
기준 브랜치·커밋: day2-a-answers, 인터뷰·PRD 커밋 뒤

## 조사한 것

- 상태 전이는 `orders/domain/order-status.ts`의 `transitionStatus`가 정한다. `NEXT_STATUS` 표는 다음 단계만 허용하므로 `cancelled`로는 전이되지 않는다.
- 재고는 `InventoryService`가 바꾼다. 차감은 `decreaseForOrder`, 되돌리는 메서드는 없다.
- `inventory_movements.kind`는 `CHECK (kind IN ('inbound', 'outbound'))`라서 새 종류를 넣으려면 표를 다시 만드는 마이그레이션이 필요하다.
- `GET /api/orders/:orderId`의 응답은 `my-order-controller.ts`가 직접 만든다. `cancellable`을 한 곳에서 계산하려고 이 응답을 `order-mapper.ts`의 `toOrderDetailDto`로 만든다.
- 관리자 목록 화면의 `nextOf`는 `FLOW` 배열 순서로 다음 상태를 찾는다. 배열에 없는 `cancelled`는 처음 상태로 계산되므로 막아야 한다.
- 주문 상태 뱃지와 단계 막대는 4개 상태만 안다. 쿠폰·포인트는 이 레포에 없다.

## AC별 계획

| AC | 바꿀 파일 | 확인할 테스트·화면 | 비고 |
| --- | --- | --- | --- |
| AC-1·3·4·5·8 | `order-status.ts`(`cancelStatus`, `canCancel`, 새 오류), `order-service.ts`(`cancel`), `order-controller.ts`, `order-mapper.ts`, `my-order-controller.ts`, contracts(`orders.ts`, `routes.ts`, `endpoints.ts`, `common.ts`), `domain-error.ts`, `api-error.ts` | `tests/orders.test.ts` | 상태 결정은 도메인 함수 한 곳, 서비스는 한 트랜잭션 |
| AC-2 | `inventory-service.ts`(`restoreForOrder`), `stock.ts`, contracts `inventory.ts` | `tests/orders.test.ts`, `tests/inventory.test.ts` | 이력 종류 `restock` |
| AC-6 | `order-controller.ts` | `tests/orders.test.ts` | `requireCustomer`로 세션에서 고객을 정한다 |
| AC-7 | 변경 없음(전이 함수가 막는다) | `tests/orders.test.ts` | |
| AC-13 | `packages/db/migrations/0002_restock_movement_kind.sql` | `migrate.test.ts` | 기존 `0001`은 건드리지 않는다 |
| AC-9·10 | `orders-pages.tsx`, `order-steps.tsx`, `status-badge.tsx` | `orders-pages.test.tsx` | 확인 창은 `role="dialog"` |
| AC-11 | `admin-orders-pages.tsx`, `order-steps.tsx` | `admin-orders-pages.test.tsx` | `nextOf` 보호 |
| AC-12 | `admin-inventory-page.tsx` | `admin-inventory-page.test.tsx` | 증가분 색은 종류가 아니라 부호로 정한다 |
| AC-14 | 없음 | `npm run verify` | 기존 expect는 고치지 않는다 |

## 범위 대조

- PRD 비범위에 닿는 변경: 없음
- 새 마이그레이션 필요 여부: 필요(`0002`). 기존 파일은 고치지 않는다.
- 규칙 8개 중 닿는 것: 1(재고 복구는 `InventoryService`), 3(전이 함수), 5(고객은 세션), 6(DTO는 mapper), 7(verify), 8(새 번호 마이그레이션). 2·4는 새 코드에 돈 계산과 시간 읽기가 없어 해당 없음(시각은 `Clock`).
