import type { OrderDetail } from "@grabmarket/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

const api = installFakeApi();

function order(status: OrderDetail["status"], cancellable: boolean): OrderDetail {
  return {
    id: 7,
    orderNumber: "GM-20261114-0007",
    status,
    cancellable,
    items: [{ productId: 1, productName: "제주 감귤 3kg", imageUrl: "/images/products/p1.webp", unitPrice: 17_900, quantity: 2, lineTotal: 35_800 }],
    subtotal: 35_800,
    shippingFee: 0,
    total: 35_800,
    paymentMethod: "virtual",
    shipping: { recipientName: "김하늘", phone: "010-1234-5678", address: "서울특별시 한울구 새벽로 12, 302호" },
    createdAt: "2026-11-14T03:00:00.000Z",
    updatedAt: "2026-11-14T03:00:00.000Z",
  };
}

function openOrder(initial: OrderDetail) {
  api.on("GET /api/auth/me", () => ({ json: { user: { id: 2, email: "customer1@grabmarket.test", name: "김하늘", role: "customer", phone: "010-1234-5678", address: "서울특별시 한울구 새벽로 12, 302호" } } }));
  api.on("GET /api/orders/7", () => ({ json: { order: { ...initial, elapsedDays: 0 } } }));
  renderApp("/orders/7");
}

describe("내 주문 상세의 주문 취소", () => {
  it("취소할 수 없는 주문에는 주문 취소 버튼이 없다", async () => {
    openOrder(order("shipping", false));
    await screen.findByRole("heading", { name: /GM-20261114-0007/ });

    expect(screen.queryByRole("button", { name: "주문 취소" })).not.toBeInTheDocument();
  });

  it("버튼을 누르면 확인 창이 뜨고, 돌아가기를 누르면 요청 없이 닫힌다", async () => {
    openOrder(order("paid", true));
    await userEvent.click(await screen.findByRole("button", { name: "주문 취소" }));

    const dialog = screen.getByRole("dialog", { name: "주문을 취소할까요?" });
    expect(dialog).toHaveTextContent("되돌릴 수 없어요");
    await userEvent.click(within(dialog).getByRole("button", { name: "돌아가기" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "주문 취소" })).toBeInTheDocument();
    expect(api.requests.some((request) => request.startsWith("POST /api/orders/7/cancel"))).toBe(false);
  });

  it("확인하면 상태가 주문취소로 바뀌고 버튼이 사라진다", async () => {
    openOrder(order("paid", true));
    api.on("POST /api/orders/7/cancel", () => ({ json: { order: order("cancelled", false) } }));
    await userEvent.click(await screen.findByRole("button", { name: "주문 취소" }));

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "주문 취소하기" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "주문 취소" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /GM-20261114-0007/ })).toHaveTextContent("주문취소");
    expect(screen.getByText("취소된 주문이에요")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("실제 환불은 없어요");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("취소 요청이 실패하면 이유를 보이고 주문은 그대로 보인다", async () => {
    openOrder(order("paid", true));
    api.on("POST /api/orders/7/cancel", () => ({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "잠시 뒤 다시 시도해 주세요." } } }));
    await userEvent.click(await screen.findByRole("button", { name: "주문 취소" }));

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "주문 취소하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("잠시 뒤 다시 시도해 주세요.");
    expect(screen.getByRole("heading", { name: /GM-20261114-0007/ })).toHaveTextContent("결제완료");
    expect(screen.getByRole("button", { name: "주문 취소" })).toBeInTheDocument();
  });

  it("그 사이 배송이 시작돼 거절되면 이유를 보이고 최신 상태로 바뀐다", async () => {
    let current = order("paid", true);
    api.on("GET /api/auth/me", () => ({ json: { user: { id: 2, email: "customer1@grabmarket.test", name: "김하늘", role: "customer", phone: null, address: null } } }));
    api.on("GET /api/orders/7", () => ({ json: { order: { ...current, elapsedDays: 0 } } }));
    api.on("POST /api/orders/7/cancel", () => {
      current = order("shipping", false);
      return { status: 409, json: { error: { code: "ORDER_NOT_CANCELLABLE", message: "배송이 시작된 주문은 취소할 수 없습니다." } } };
    });
    renderApp("/orders/7");
    await userEvent.click(await screen.findByRole("button", { name: "주문 취소" }));

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "주문 취소하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("배송이 시작된 주문은 취소할 수 없습니다.");
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /GM-20261114-0007/ })).toHaveTextContent("배송중");
    });
    expect(screen.queryByRole("button", { name: "주문 취소" })).not.toBeInTheDocument();
  });
});
