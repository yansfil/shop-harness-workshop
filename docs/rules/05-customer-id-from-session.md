# 5. 고객 ID는 세션에서만

"누구의 주문인가"는 로그인 세션에서 정합니다.
요청 본문·쿼리·경로에 들어온 고객 ID(`customerId`, `userId`)는 읽지 않습니다.
그래서 `packages/contracts`의 고객용 요청 스키마에는 고객 ID 필드가 없습니다.

## 이유

요청에 담긴 고객 ID는 브라우저에서 누구나 바꿀 수 있습니다.
그 값을 믿으면 다른 고객의 이름으로 주문하거나 남의 주문을 볼 수 있습니다.
남의 주문 번호로 들어오면 "없음"(404)으로 답해 주문이 있다는 사실도 드러내지 않습니다.

## 좋은 예

```ts
router.get(ROUTES.order, (req, res) => {
  const user = requireCustomer(res); // 세션 미들웨어가 넣어 둔 사용자
  const { orderId } = OrderParamsSchema.parse(req.params);
  const order = this.#orders.getForCustomer(user.id, orderId); // 남의 주문이면 NotFound
  res.json({ order: toOrderDetailDto(order) });
});
```

## 나쁜 예

```ts
const orders = this.#orders.listByCustomer(Number(req.query.customerId));
const order = this.#orders.create({ ...req.body, customerId: req.body.customerId });
```
