# free-shipping-threshold 구현 계획

PRD: docs/tasks/free-shipping-threshold.md
기준 브랜치·커밋: day2-b-answers, 인터뷰·PRD 커밋 뒤

## 조사한 것

- 기준 상수는 `orders/domain/shipping-fee.ts`의 `FREE_SHIPPING_THRESHOLD` 한 곳이다. 견적(`OrderService.quote`)과 주문 생성이 `priceOrder`를 거쳐 같은 함수를 쓴다.
- 견적 응답은 `order-mapper.ts`의 `toQuoteDto`가 만들고 계약은 `OrderQuoteResponseSchema`다.
- 장바구니와 주문서는 `components/summary-box.tsx`의 `AmountRows` 한 조각으로 금액을 보인다. 상품 상세는 배송비 값만 따로 보인다.
- `shared`의 `Money`에는 빼기 헬퍼가 없다. 남은 금액 계산에 `subtractMoney`가 필요하다.
- 기존 기대값: `tests/orders.test.ts`의 합계 50,700원 주문은 기준이 50,000원이어도 무료이고 합계 10,000원은 3,000원이라 그대로 통과한다.
- 주문 응답은 `orders.shipping_fee`에 저장된 값을 읽으므로 기준을 바꿔도 기존 주문은 바뀌지 않는다.

## AC별 계획

| AC | 바꿀 파일 | 확인할 테스트·화면 | 비고 |
| --- | --- | --- | --- |
| AC-1·2·3 | `shipping-fee.ts`(기준, `remainingForFreeShipping`), `order-service.ts`, `order-mapper.ts`, contracts `orders.ts`, `shared/money.ts`(`subtractMoney`) | `tests/orders.test.ts` 새 케이스, `money.test.ts` | 기준 한 곳, 계산은 Money로만 |
| AC-4 | 변경 없음 | `tests/orders.test.ts` | 저장된 값을 읽는 기존 동작 확인 |
| AC-5 | `summary-box.tsx`, `cart-page.tsx`, `checkout-page.tsx` | `summary-box.test.tsx` | 화면은 서버 값만 보인다 |
| AC-6 | 없음 | `npm run verify` | 기존 expect는 고치지 않는다 |

## 범위 대조

- PRD 비범위에 닿는 변경: 없음
- 새 마이그레이션 필요 여부: 없음
- 규칙 8개 중 닿는 것: 2(돈은 Money), 6(응답 DTO는 mapper), 7(verify와 고정 기대값)
