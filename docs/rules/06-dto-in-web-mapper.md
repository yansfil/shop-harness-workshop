# 6. DTO 변환은 web mapper

도메인 객체를 응답 JSON(DTO)으로 바꾸는 일은 각 모듈 `web` 계층의 mapper 함수만 합니다.
응답 모양은 `packages/contracts`의 zod 스키마가 정하고, mapper는 그 타입을 돌려줍니다.
controller는 요청 검사 → service 호출 → mapper 호출 → 응답만 합니다.

## 이유

DTO를 service나 repository가 만들면 화면용 모양(표기용 이름, 이미지 URL)이 도메인 안으로 새어 들어갑니다.
controller마다 객체 리터럴로 응답을 만들면 같은 주문이 화면마다 다른 모양으로 나갑니다.
mapper 한 곳이 contracts 타입을 돌려주면 계약이 바뀔 때 타입 검사가 고칠 곳을 모두 알려 줍니다.

## 좋은 예

```ts
// orders/web/order-mapper.ts
export function toOrderSummaryDto(order: Order): OrderSummary {
  return { id: order.id, orderNumber: order.number, status: order.status, total: order.total, ... };
}

// orders/web/order-controller.ts
const orders = this.#orderService.listForCustomer(user.id);
res.json({ orders: orders.map(toOrderSummaryDto) } satisfies MyOrderListResponse);
```

## 나쁜 예

```ts
// orders/web/order-controller.ts
const rows = this.#orderRepository.findByCustomer(user.id); // controller가 repository를 직접 부름
res.json({ orders: rows.map((row) => ({ id: row.id, total: row.total_amount, status: row.status })) });
```
