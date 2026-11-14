import type { Money } from "@grabmarket/shared";
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE } from "../domain/shipping-fee.ts";

export interface ShippingPolicy {
  fee: Money;
  freeThreshold: Money;
}

/** 화면이 배송 안내 문구에 쓰는 규칙 값. 견적과 주문이 쓰는 같은 두 상수에서 온다. */
export function getShippingPolicy(): ShippingPolicy {
  return { fee: SHIPPING_FEE, freeThreshold: FREE_SHIPPING_THRESHOLD };
}
