import type { ShippingInfo } from "@grabmarket/contracts";

/**
 * 이번 주문에서만 고친 배송지. 재고 부족 뒤 장바구니에 다녀와도 주문서가 같은 값을 보이게 메모리에만 둔다.
 * 사용자 한 명의 값 하나만 가지며, 다른 사용자가 열거나 주문이 끝나면 비운다. 새로 고치면 기본 배송지로 돌아간다.
 */
let draft: { userId: number; shipping: ShippingInfo } | null = null;

export function readShippingDraft(userId: number): ShippingInfo | null {
  return draft?.userId === userId ? draft.shipping : null;
}

export function saveShippingDraft(userId: number, shipping: ShippingInfo): void {
  draft = { userId, shipping };
}

export function clearShippingDraft(): void {
  draft = null;
}
