import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

const api = installFakeApi();

function setUp(subtotal: number, remaining: number) {
  api.on("GET /api/auth/me", () => ({ json: { user: { id: 2, email: "customer1@grabmarket.test", name: "김하늘", role: "customer", phone: "010-1234-5678", address: "서울특별시 한울구 새벽로 12, 302호" } } }));
  api.on("GET /api/products/1", () => ({
    json: {
      product: {
        id: 1,
        name: "제주 감귤 3kg",
        optionLabel: "3kg",
        category: { slug: "food", name: "식품" },
        price: 17_900,
        imageUrl: "/images/products/p1.webp",
        stockQuantity: 40,
        stockStatus: "in_stock",
        description: "감귤",
        story: { eyebrow: "제철 과일", headline: "제주 감귤", intro: "감귤입니다.", points: [], care: { title: "보관", body: "서늘한 곳" }, info: [] },
        variants: [],
      },
    },
  }));
  api.on("POST /api/orders/quote", () => {
    const shippingFee = remaining > 0 ? 3_000 : 0;
    return { json: { items: [{ productId: 1, productName: "제주 감귤 3kg", unitPrice: 17_900, quantity: 2, lineTotal: subtotal }], subtotal, shippingFee, total: subtotal + shippingFee, freeShippingRemaining: remaining, shortages: [] } };
  });
}

const HINT = "14,200원 더 담으면 무료배송";

describe("작은 화면 하단 요약의 무료배송 안내", () => {
  it("장바구니 하단 요약에 남은 금액 안내가 있다", async () => {
    setUp(35_800, 14_200);
    renderApp("/cart", { cart: [{ productId: 1, quantity: 2, selected: true }] });

    const bar = await screen.findByRole("region", { name: "하단 결제 요약" });
    expect(await within(bar).findByText(HINT)).toBeInTheDocument();
  });

  it("주문서 하단 요약에 남은 금액 안내가 있다", async () => {
    setUp(35_800, 14_200);
    renderApp("/checkout?productId=1&quantity=2");

    const bar = await screen.findByRole("region", { name: "하단 결제 요약" });
    expect(await within(bar).findByText(HINT)).toBeInTheDocument();
  });

  it("이미 무료배송이면 하단 요약에 안내가 없다", async () => {
    setUp(50_000, 0);
    renderApp("/checkout?productId=1&quantity=2");

    const bar = await screen.findByRole("region", { name: "하단 결제 요약" });
    await within(bar).findByText("결제 금액");
    await screen.findAllByText("50,000원");
    expect(within(bar).queryByText(/더 담으면 무료배송/)).not.toBeInTheDocument();
  });
});
