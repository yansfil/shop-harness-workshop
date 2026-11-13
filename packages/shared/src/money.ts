// 돈은 정수 원(Money)으로만 다룬다. 소수·부동소수 계산은 허용하지 않는다.
declare const moneyBrand: unique symbol;

/** 정수 원 금액. JSON에서는 그냥 정수다. */
export type Money = number & { readonly [moneyBrand]: true };

export class InvalidMoneyError extends Error {
  constructor(value: number) {
    super(`금액은 0 이상의 정수 원이어야 합니다: ${value}`);
    this.name = "InvalidMoneyError";
  }
}

/** 정수 원 값을 Money로 만든다. 음수·소수·안전 정수 밖은 거절한다. */
export function won(value: number): Money {
  if (!Number.isSafeInteger(value) || value < 0) throw new InvalidMoneyError(value);
  return value as Money;
}

export const ZERO_WON: Money = won(0);

export function addMoney(a: Money, b: Money): Money {
  return won(a + b);
}

/** a - b. b가 a보다 크면 음수라서 won()이 던진다. 먼저 크기를 비교한 뒤 부른다. */
export function subtractMoney(a: Money, b: Money): Money {
  return won(a - b);
}

/** 단가 × 수량. 수량은 0 이상의 정수다. */
export function multiplyMoney(unitPrice: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new RangeError(`수량은 0 이상의 정수여야 합니다: ${quantity}`);
  }
  return won(unitPrice * quantity);
}

export function sumMoney(values: Iterable<Money>): Money {
  let total = ZERO_WON;
  for (const value of values) total = addMoney(total, value);
  return total;
}

/** 화면 표기: 12900 → "12,900원" */
export function formatWon(value: Money): string {
  return `${value.toLocaleString("ko-KR")}원`;
}
