# 1. 재고는 inventory 서비스로만

재고 수량(`inventory.quantity`)은 inventory 모듈의 서비스(`InventoryService`)만 바꿉니다.
주문·입고·시드 어디서든 재고를 바꾸려면 이 서비스의 메서드를 부릅니다.

## 이유

재고가 바뀔 때마다 `inventory_movements`에 이력 한 줄이 남아야 관리자가 입출고를 추적할 수 있습니다.
수량 확인과 차감이 한 트랜잭션 안에서 일어나야 동시에 들어온 주문이 재고를 음수로 만들지 않습니다.
이 두 가지를 한 곳에서만 지키면 나머지 코드는 신경 쓰지 않아도 됩니다.

## 좋은 예

```ts
// orders/application/order-service.ts
const shortages = this.#inventory.decreaseForOrder(order.id, lines);
if (shortages.length > 0) throw new InsufficientStockError(shortages);
```

## 나쁜 예

```ts
// orders/infra/order-repository.ts
db.prepare("UPDATE inventory SET quantity = quantity - ? WHERE product_id = ?").run(qty, productId);
```

주문 쪽에서 재고 테이블을 직접 고치면 이력이 남지 않고, 부족 검사도 빠지기 쉽습니다.
