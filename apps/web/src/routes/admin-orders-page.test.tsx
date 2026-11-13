import type { AdminOrderDetail, AdminOrderListResponse, AdminOrderRow, OrderStatus } from "@grabmarket/contracts";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

const api = installFakeApi();

function row(id: number, status: OrderStatus = "paid"): AdminOrderRow {
  return {
    id,
    orderNumber: `GM-20261114-${String(id).padStart(4, "0")}`,
    customerName: "김하늘",
    status,
    total: 17_900,
    itemCount: 1,
    firstItemName: "제주 감귤 3kg",
    createdAt: "2026-11-14T03:00:00.000Z",
  };
}

function listing(overrides: Partial<AdminOrderListResponse> = {}): AdminOrderListResponse {
  const orders = overrides.orders ?? [row(25), row(24), row(23)];
  return {
    orders,
    total: 25,
    statusCounts: { all: 25, paid: 10, preparing: 8, shipping: 5, delivered: 2 },
    page: 1,
    pageSize: 10,
    pageCount: 3,
    nextCursor: null,
    ...overrides,
  };
}

/** 상태 변경 응답(계약 모양). 화면은 이 안의 status를 쓰지 않고 목록을 다시 받는다. */
function changed(id: number, status: OrderStatus): { json: { order: AdminOrderDetail } } {
  return {
    json: {
      order: {
        id,
        orderNumber: `GM-20261114-${String(id).padStart(4, "0")}`,
        status,
        items: [{ productId: 1, productName: "제주 감귤 3kg", imageUrl: "/images/products/p1.webp", unitPrice: 17_900, quantity: 1, lineTotal: 17_900 }],
        subtotal: 17_900,
        shippingFee: 0,
        total: 17_900,
        paymentMethod: "virtual",
        shipping: { recipientName: "김하늘", phone: "010-0000-0000", address: "서울특별시 한울구 새벽로 12, 302호" },
        createdAt: "2026-11-14T03:00:00.000Z",
        updatedAt: "2026-11-14T03:05:00.000Z",
        customer: { id: 2, name: "김하늘", email: "sky@grabmarket.test" },
        nextStatus: "shipping",
      },
    },
  };
}

function loginAsAdmin() {
  api.on("GET /api/auth/me", () => ({ json: { user: { id: 1, name: "그랩마켓 운영자", email: "admin@grabmarket.test", role: "admin", phone: null, address: null } } }));
}

describe("관리자 주문 목록 (과제 정답)", () => {
  it("상태 칩에 개수가 있고, 전체 건수와 지금 범위를 보인다", async () => {
    loginAsAdmin();
    api.on("GET /api/admin/orders", () => ({ json: listing() }));
    renderApp("/admin/orders");

    const chips = within(await screen.findByRole("navigation", { name: "상태" }));
    expect(chips.getAllByRole("link").map((link) => link.textContent)).toEqual(["전체25", "결제완료10", "배송준비8", "배송중5", "배송완료2"]);
    expect(chips.getByRole("link", { name: /^전체/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("25건 중 1–3")).toBeInTheDocument();
  });

  it("상태 칩을 누르면 그 상태로 다시 불러오고 1쪽부터 본다", async () => {
    loginAsAdmin();
    api.on("GET /api/admin/orders", ({ url }) => ({ json: url.searchParams.get("status") === "shipping" ? listing({ total: 5, orders: [row(9, "shipping")], pageCount: 1 }) : listing() }));
    renderApp("/admin/orders?page=2");
    await screen.findByRole("navigation", { name: "상태" });

    await userEvent.click(screen.getByRole("link", { name: /^배송중/ }));

    expect(await screen.findByText("배송중 5건")).toBeInTheDocument();
    expect(api.requests).toContain("GET /api/admin/orders?status=shipping&page=1");
  });

  it("검색어를 치고 엔터를 누르면 주소에 q가 붙고 상태 조건은 남는다", async () => {
    loginAsAdmin();
    api.on("GET /api/admin/orders", () => ({ json: listing() }));
    const router = renderApp("/admin/orders?status=paid");
    const box = await screen.findByRole("searchbox", { name: "주문 검색" });

    await userEvent.type(box, "이도윤{Enter}");

    await screen.findByText(/건 중/);
    expect(router.state.location.search).toBe(`?status=paid&q=${encodeURIComponent("이도윤")}`);
  });

  it("페이지 번호를 누르면 그 쪽을 불러오고, 첫 쪽에서는 이전이 눌리지 않는다", async () => {
    loginAsAdmin();
    api.on("GET /api/admin/orders", ({ url }) => ({ json: url.searchParams.get("page") === "2" ? listing({ page: 2, orders: [row(15)] }) : listing() }));
    renderApp("/admin/orders");
    const pager = within(await screen.findByRole("navigation", { name: "페이지 이동" }));
    expect(pager.getByText("이전")).toHaveAttribute("aria-disabled", "true");
    expect(pager.getByText("1")).toHaveAttribute("aria-current", "page");

    await userEvent.click(pager.getByRole("link", { name: "2쪽" }));

    expect(await screen.findByText("25건 중 11–11")).toBeInTheDocument();
    expect(api.requests).toContain("GET /api/admin/orders?page=2");
  });

  it("상태를 바꾸면 현재 조건으로 목록과 칩 개수를 서버에서 다시 받는다", async () => {
    loginAsAdmin();
    let done = false;
    api.on("GET /api/admin/orders", ({ url }) => {
      const paid = url.searchParams.get("status") === "paid";
      if (!done) return { json: listing({ total: 2, orders: [row(2), row(1)], pageCount: 1, statusCounts: { all: 2, paid: 2, preparing: 0, shipping: 0, delivered: 0 } }) };
      return { json: listing({ total: paid ? 1 : 2, orders: paid ? [row(1)] : [row(2, "preparing"), row(1)], pageCount: 1, statusCounts: { all: 2, paid: 1, preparing: 1, shipping: 0, delivered: 0 } }) };
    });
    api.on("POST /api/admin/orders/2/status", () => {
      done = true;
      return changed(2, "preparing");
    });
    renderApp("/admin/orders?status=paid");
    expect(await screen.findByText("2건 중 1–2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "GM-20261114-0002 배송준비로 변경" }));

    expect(await screen.findByText("1건 중 1–1")).toBeInTheDocument();
    expect(screen.queryByText("GM-20261114-0002")).not.toBeInTheDocument();
    const chips = within(screen.getByRole("navigation", { name: "상태" }));
    expect(chips.getAllByRole("link").map((link) => link.textContent)).toEqual(["전체2", "결제완료1", "배송준비1", "배송중0", "배송완료0"]);
  });

  it("마지막 쪽의 마지막 주문을 바꾸면 그 쪽이 비지 않고 남은 쪽을 보인다", async () => {
    loginAsAdmin();
    let done = false;
    api.on("GET /api/admin/orders", ({ url }) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      if (!done) return { json: listing({ page, total: 11, orders: [row(1)], pageCount: 2 }) };
      return { json: listing({ page, total: 10, orders: page === 1 ? [row(10)] : [], pageCount: 1 }) };
    });
    api.on("POST /api/admin/orders/1/status", () => {
      done = true;
      return changed(1, "preparing");
    });
    renderApp("/admin/orders?page=2");
    await screen.findByText("11건 중 11–11");

    await userEvent.click(screen.getByRole("button", { name: "GM-20261114-0001 배송준비로 변경" }));

    expect(await screen.findByText("10건 중 1–1")).toBeInTheDocument();
  });

  it("조건에 맞는 주문이 없으면 안내와 조건 지우기를 보인다", async () => {
    loginAsAdmin();
    api.on("GET /api/admin/orders", () => ({ json: listing({ orders: [], total: 0, pageCount: 0, statusCounts: { all: 0, paid: 0, preparing: 0, shipping: 0, delivered: 0 } }) }));
    renderApp("/admin/orders?q=" + encodeURIComponent("없는사람"));

    expect(await screen.findByRole("heading", { name: "조건에 맞는 주문이 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "조건 지우기" })).toHaveAttribute("href", "/admin/orders");
  });

  it("모양이 틀린 조건은 찾을 수 없음으로 다룬다", async () => {
    loginAsAdmin();
    renderApp("/admin/orders?status=cancelled");
    expect(await screen.findByText("페이지를 찾을 수 없어요")).toBeInTheDocument();
  });
});
