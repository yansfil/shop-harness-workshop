import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store.ts";

/** 장바구니 한 줄. 상품 정보(이름·가격·재고)는 저장하지 않고 화면이 열릴 때 서버에서 읽는다. */
export interface CartLine {
  productId: number;
  quantity: number;
  selected: boolean;
}

export const MAX_LINE_QUANTITY = 99;

function parseCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) throw new TypeError("장바구니 값이 배열이 아닙니다");
  return raw.map((item: unknown) => {
    const line = item as Partial<CartLine> | null;
    if (
      line === null ||
      typeof line !== "object" ||
      !Number.isInteger(line.productId) ||
      !Number.isInteger(line.quantity) ||
      typeof line.selected !== "boolean"
    ) {
      throw new TypeError("장바구니 줄의 형식이 다릅니다");
    }
    return { productId: line.productId as number, quantity: line.quantity as number, selected: line.selected };
  });
}

export const cartStore = createPersistedStore<CartLine[]>("grabmarket.cart", parseCart, []);

export function useCartLines(): CartLine[] {
  return useSyncExternalStore(cartStore.subscribe, cartStore.get);
}

export function clampQuantity(quantity: number, max: number): number {
  return Math.max(1, Math.min(quantity, max, MAX_LINE_QUANTITY));
}

/** 담는다. 이미 있으면 수량을 합치고 max(재고)를 넘기지 않는다. 담은 뒤의 수량을 돌려준다. */
export function addToCart(productId: number, quantity: number, max: number): number {
  const lines = cartStore.get();
  const existing = lines.find((line) => line.productId === productId);
  const next = clampQuantity((existing?.quantity ?? 0) + quantity, max);
  cartStore.set(
    existing === undefined
      ? [...lines, { productId, quantity: next, selected: true }]
      : lines.map((line) => (line.productId === productId ? { ...line, quantity: next, selected: true } : line)),
  );
  return next;
}

export function setCartQuantity(productId: number, quantity: number, max: number): void {
  cartStore.set(cartStore.get().map((line) => (line.productId === productId ? { ...line, quantity: clampQuantity(quantity, max) } : line)));
}

export function setCartSelected(productIds: readonly number[], selected: boolean): void {
  const targets = new Set(productIds);
  cartStore.set(cartStore.get().map((line) => (targets.has(line.productId) ? { ...line, selected } : line)));
}

export function removeFromCart(productIds: readonly number[]): void {
  const targets = new Set(productIds);
  cartStore.set(cartStore.get().filter((line) => !targets.has(line.productId)));
}

export function selectedCartLines(): CartLine[] {
  return cartStore.get().filter((line) => line.selected);
}
