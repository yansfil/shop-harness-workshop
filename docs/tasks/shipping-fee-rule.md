# 배송비 규칙 (과제 재료)

현재 규칙이 어디에 있고 무엇을 바꾸면 어디가 같이 움직이는지 적은 설명이다.
규칙을 바꾸는 요청을 받은 에이전트가 영향 범위를 찾는 연습에 쓴다.
이 문서는 규칙을 바꾸지 않는다. 바꾸는 일은 `interview` → `prd` → `implement`로 한다.

## 현재 규칙

상품 합계가 50,000원 이상이면 배송비 0원, 미만이면 3,000원이다.
결제 금액은 상품 합계 + 배송비다.
기준을 30,000원에서 50,000원으로 올린 변경은 `docs/tasks/free-shipping-threshold.md`에 있다.

규칙은 `apps/api/src/orders/domain/shipping-fee.ts` 한 곳이다.

```ts
export const SHIPPING_FEE = won(3_000);
export const FREE_SHIPPING_THRESHOLD = won(50_000);
export function calculateShippingFee(subtotal: Money): Money { ... }
```

## 이 규칙을 쓰는 곳

| 위치 | 하는 일 |
| --- | --- |
| `apps/api/src/orders/domain/order.ts`의 `priceOrder` | 상품 합계로 `calculateShippingFee`를 부르고 결제 금액을 만든다. 견적(`quote`)과 주문 생성(`place`)이 같은 함수를 쓴다 |
| `apps/api/src/orders/web/order-mapper.ts` | 배송비를 응답 DTO에 옮긴다 |
| `packages/contracts/src/orders.ts` | 견적·주문 응답의 `shippingFee` 필드와 "배송비 규칙은 서버 한 곳" 주석 |
| `packages/db/migrations/0001_init.sql`의 `orders.shipping_fee` | 주문 시점의 배송비를 주문에 저장한다. 이미 만든 주문은 규칙이 바뀌어도 저장된 값이 그대로다 |
| `apps/web/src/lib/use-quote.ts`, `components/summary-box.tsx` | 화면은 견적 응답의 값(남은 금액 `freeShippingRemaining` 포함)을 그대로 보인다. 장바구니·주문서가 같은 조각을 쓰고, 상품 상세는 배송비 값만 보인다 |
| `apps/web/src/routes/orders-pages.tsx`, `admin-orders-pages.tsx` | 주문 상세에서 저장된 배송비를 보인다 |
| `apps/api/src/seed/seed-database.ts`, `order-simulator.ts` | 시드 주문과 시뮬레이터 주문도 같은 주문 서비스를 거치므로 규칙이 바뀌면 `npm run db:reset`으로 만든 주문 금액이 달라진다 |

## 지금 규칙을 고정한 테스트

- `tests/orders.test.ts`: 합계 17,900 × 2 + 14,900원 주문의 `shippingFee`가 0, 합계 10,000원 주문의 견적·주문이 `shippingFee: 3_000, total: 13_000`.
- 규칙을 바꾸면 이 기대값이 정당하게 달라질 수 있다. 그래도 기존 `expect` 값을 몰래 맞추지 않고, PRD에 바뀐 규칙과 근거를 적은 뒤 그 PRD의 완료 조건에서 새 기대값을 가져온다(`docs/rules/07-verify-and-fixed-expectations.md`).

## 바꿀 거리 예시

요청 하나가 얼마나 넓게 퍼지는지가 연습의 핵심이다.

| 요청 | 퍼지는 범위 | 빠지기 쉬운 결정 |
| --- | --- | --- |
| 무료배송 기준을 50,000원으로 올려 달라 | 상수 하나와 기대값 | 이미 장바구니에 담은 사용자의 안내 문구, 배송비를 안내하는 "N원 더 담으면 무료" 같은 문구가 필요한지 |
| 도서산간 지역은 3,000원을 더 받아 달라 | 견적 요청에 배송지가 없다(배송지는 주문 생성 때만 받는다). 계약, 견적 API, 주문서 화면, 주문 상세, 시드 | 어떤 주소를 도서산간으로 볼 것인지, 무료배송이어도 추가금을 받는지, 주소를 바꾸면 견적이 다시 계산되는지 |
| 카테고리별로 배송비를 다르게 해 달라 | 상품 데이터와 계산 입력, 계약, 화면 | 한 주문에 여러 카테고리가 섞일 때 어떻게 합칠지 |

## 이 레포의 규칙과 닿는 곳

- 금액은 `Money`(정수 원)로만 계산한다(`docs/rules/02-money-integer-won.md`). 비율 배송비 같은 요청이 와도 소수 계산을 쓰지 않는다.
- 배송비는 서버가 계산하고 화면이 다시 계산하지 않는다(`apps/web/CLAUDE.md`).
- 스키마가 필요하면 새 번호 마이그레이션이다(`docs/rules/08-new-numbered-migration.md`).
