import { type Money, subtractMoney, won, ZERO_WON } from "@grabmarket/shared";

/** 배송비 규칙은 이 두 상수가 전부다. 견적과 주문이 같은 함수를 쓴다. */
export const SHIPPING_FEE = won(3_000);
export const FREE_SHIPPING_THRESHOLD = won(50_000);

export function calculateShippingFee(subtotal: Money): Money {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? won(0) : SHIPPING_FEE;
}

/** 무료배송까지 더 담아야 하는 금액. 이미 무료배송이면 0이다. */
export function remainingForFreeShipping(subtotal: Money): Money {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? ZERO_WON : subtractMoney(FREE_SHIPPING_THRESHOLD, subtotal);
}
