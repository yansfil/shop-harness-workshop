# 3. 주문 상태는 도메인 전이 함수로만

주문 상태(`status`)는 orders 도메인의 전이 함수만 바꿉니다.
상태는 결제완료(`paid`) → 배송준비(`preparing`) → 배송중(`shipping`) → 배송완료(`delivered`) 순서로 한 단계씩만 넘어갑니다.

## 이유

전이 규칙이 한 함수에 있어야 "배송완료를 결제완료로 되돌리기" 같은 잘못된 전이를 한 곳에서 막을 수 있습니다.
서비스·controller·SQL 여기저기서 `status`를 대입하면 규칙이 복사되고, 복사본 중 하나만 고쳐집니다.

## 좋은 예

```ts
// orders/domain/order-status.ts
export function transitionStatus(current: OrderStatus, next: OrderStatus): OrderStatus {
  if (NEXT_STATUS[current] !== next) throw new InvalidStatusTransitionError(current, next);
  return next;
}

// orders/application/admin-order-service.ts
const status = transitionStatus(order.status, requested);
this.#orders.saveStatus(order.id, status, this.#clock.now());
```

## 나쁜 예

```ts
// orders/web/admin-order-controller.ts
order.status = req.body.status;
db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(req.body.status, id);
```
