import { beforeEach, describe, expect, it } from "vitest";
import { addToCart, cartStore, removeFromCart, selectedCartLines, setCartQuantity, setCartSelected } from "./cart.ts";

beforeEach(() => {
  localStorage.clear();
  cartStore.reload();
});

describe("장바구니(브라우저 저장)", () => {
  it("같은 상품을 또 담으면 수량이 합쳐지고 재고를 넘지 않는다", () => {
    expect(addToCart(7, 2, 5)).toBe(2);
    expect(addToCart(7, 2, 5)).toBe(4);
    expect(addToCart(7, 3, 5)).toBe(5);
    expect(cartStore.get()).toEqual([{ productId: 7, quantity: 5, selected: true }]);
  });

  it("수량은 1 이상 재고 이하로만 바뀐다", () => {
    addToCart(7, 1, 5);
    setCartQuantity(7, 0, 5);
    expect(cartStore.get()[0]?.quantity).toBe(1);
    setCartQuantity(7, 9, 5);
    expect(cartStore.get()[0]?.quantity).toBe(5);
  });

  it("선택한 줄만 주문 대상이고 새로고침해도 남는다", () => {
    addToCart(1, 1, 9);
    addToCart(2, 1, 9);
    setCartSelected([2], false);
    expect(selectedCartLines().map((line) => line.productId)).toEqual([1]);
    cartStore.reload();
    expect(cartStore.get()).toHaveLength(2);
    removeFromCart([1]);
    expect(cartStore.get().map((line) => line.productId)).toEqual([2]);
  });

  it("저장된 값이 망가졌으면 경고하고 빈 장바구니로 시작한다", () => {
    localStorage.setItem("grabmarket.cart", "{not json");
    cartStore.reload();
    expect(cartStore.get()).toEqual([]);
  });
});
