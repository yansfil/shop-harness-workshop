import { type Money, won } from "@grabmarket/shared";

/** 배송비 규칙은 이 두 상수가 전부다. 견적과 주문이 같은 함수를 쓴다. */
export const SHIPPING_FEE = won(3_000);
export const FREE_SHIPPING_THRESHOLD = won(30_000);

export function calculateShippingFee(subtotal: Money): Money {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? won(0) : SHIPPING_FEE;
}
