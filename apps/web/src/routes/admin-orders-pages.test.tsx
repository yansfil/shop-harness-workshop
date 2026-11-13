import type { AdminOrderDetail } from "@grabmarket/contracts";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

const api = installFakeApi();

function asAdmin() {
  api.on("GET /api/auth/me", () => ({ json: { user: { id: 1, email: "admin@grabmarket.test", name: "운영자", role: "admin", phone: null, address: null } } }));
}

function detail(status: AdminOrderDetail["status"], nextStatus: AdminOrderDetail["nextStatus"]): AdminOrderDetail {
  return {
    id: 7,
    orderNumber: "GM-20261114-0007",
    status,
    cancellable: false,
    items: [{ productId: 1, productName: "제주 감귤 3kg", imageUrl: "/images/products/p1.webp", unitPrice: 17_900, quantity: 2, lineTotal: 35_800 }],
    subtotal: 35_800,
    shippingFee: 0,
    total: 35_800,
    paymentMethod: "virtual",
    shipping: { recipientName: "김하늘", phone: "010-1234-5678", address: "서울특별시 한울구 새벽로 12, 302호" },
    createdAt: "2026-11-14T03:00:00.000Z",
    updatedAt: "2026-11-14T03:00:00.000Z",
    customer: { id: 2, name: "김하늘", email: "customer1@grabmarket.test" },
    nextStatus,
  };
}

describe("관리자 주문 화면의 취소된 주문", () => {
  it("주문 목록은 취소된 주문을 뱃지로 보이고 다음 단계 버튼을 보이지 않는다", async () => {
    asAdmin();
    const row = { id: 7, orderNumber: "GM-20261114-0007", customerName: "김하늘", status: "cancelled", total: 35_800, itemCount: 1, firstItemName: "제주 감귤 3kg", createdAt: "2026-11-14T03:00:00.000Z" };
    api.on("GET /api/admin/orders", () => ({ json: { orders: [row, { ...row, id: 8, orderNumber: "GM-20261114-0008", status: "paid" }] } }));
    renderApp("/admin/orders");

    const cancelled = within(await screen.findByRole("row", { name: /GM-20261114-0007/ }));
    expect(cancelled.getByText("주문취소")).toBeInTheDocument();
    expect(cancelled.queryByRole("button")).not.toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /GM-20261114-0008/ })).getByRole("button", { name: /배송준비로 변경/ })).toBeInTheDocument();
  });

  it("주문 상세는 취소된 주문을 알리고 다음 단계 버튼을 보이지 않는다", async () => {
    asAdmin();
    api.on("GET /api/admin/orders/7", () => ({ json: { order: detail("cancelled", null) } }));
    renderApp("/admin/orders/7");

    expect(await screen.findByRole("heading", { name: "GM-20261114-0007" })).toBeInTheDocument();
    expect(screen.getByText("고객이 취소한 주문이에요")).toBeInTheDocument();
    expect(screen.getByText("취소된 주문이에요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /변경/ })).not.toBeInTheDocument();
  });
});
