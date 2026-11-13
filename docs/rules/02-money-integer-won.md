# 2. 돈은 정수 원 Money

금액은 `@grabmarket/shared`의 `Money`(정수 원)로만 다룹니다.
만들 때는 `won()`, 계산은 `addMoney`·`multiplyMoney`·`sumMoney`, 화면 표기는 `formatWon`을 씁니다.
DB와 JSON에는 정수로 저장합니다.

## 이유

`0.1 + 0.2`처럼 부동소수 계산은 1원 단위 오차를 만들고, 오차는 합계·정산에서 쌓입니다.
`won()`은 소수·음수를 받으면 바로 예외를 던지므로 잘못된 금액이 조용히 퍼지지 않습니다.

## 좋은 예

```ts
const lineTotal = multiplyMoney(won(item.unitPrice), item.quantity);
const total = addMoney(subtotal, shippingFee);
```

## 나쁜 예

```ts
const total = items.reduce((sum, item) => sum + item.price * item.qty * 1.0, 0);
const discounted = Math.round(total * 0.9 * 100) / 100;
```

소수 계산과 반올림 위치가 코드마다 달라지면 같은 주문의 금액이 화면마다 다르게 나옵니다.
