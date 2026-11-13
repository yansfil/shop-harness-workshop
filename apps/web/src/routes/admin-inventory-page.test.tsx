import type { InventoryItem } from "@grabmarket/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

const api = installFakeApi();

function stock(productId: number, productName: string, quantity: number, safetyStock: number): InventoryItem {
  return { productId, productName, categoryName: "식품", quantity, safetyStock, lowStock: quantity < safetyStock, updatedAt: "2026-11-14T03:00:00.000Z" };
}

function openInventory(items: InventoryItem[]) {
  let current = items;
  api.on("GET /api/auth/me", () => ({ json: { user: { id: 1, email: "admin@grabmarket.test", name: "운영자", role: "admin", phone: null, address: null } } }));
  api.on("GET /api/admin/inventory", () => ({ json: { items: current } }));
  api.on("GET /api/admin/inventory/2/movements", () => ({ json: { item: current[1], movements: [] } }));
  api.on("POST /api/admin/inventory/2/inbound", ({ body }) => {
    const quantity = (body as { quantity: number }).quantity;
    current = current.map((item) => (item.productId === 2 ? stock(2, item.productName, item.quantity + quantity, item.safetyStock) : item));
    return {
      status: 201,
      json: { item: current[1], movement: { id: 1, kind: "inbound", quantityDelta: quantity, quantityAfter: current[1]?.quantity, orderNumber: null, memo: null, createdByName: "운영자", createdAt: "2026-11-14T03:05:00.000Z" } },
    };
  });
  renderApp("/admin/inventory");
}

const SAMPLE = [stock(1, "제주 감귤 3kg", 10, 5), stock(2, "충전기", 3, 5), stock(3, "백미 4kg", 0, 5)];

const rowOf = (name: string) => screen.getByRole("row", { name: new RegExp(name) });
const alertLine = () => screen.queryByRole("button", { name: /^안전재고 미만 \d+개/ });

describe("관리자 재고 화면의 안전재고 알림", () => {
  it("안전재고 미만 상품 행에만 뱃지가 있다", async () => {
    openInventory(SAMPLE);
    await screen.findByRole("row", { name: /충전기/ });

    expect(within(rowOf("충전기")).getByText("안전재고 미만")).toBeInTheDocument();
    expect(within(rowOf("백미")).getByText("안전재고 미만")).toBeInTheDocument();
    expect(within(rowOf("제주 감귤")).queryByText("안전재고 미만")).not.toBeInTheDocument();
  });

  it("안전재고 미만이 2개면 알림 줄에 개수를 보인다", async () => {
    openInventory(SAMPLE);
    expect(await screen.findByRole("button", { name: "안전재고 미만 2개" })).toBeInTheDocument();
  });

  it("안전재고 미만 상품이 없으면 알림 줄이 없다", async () => {
    openInventory([stock(1, "제주 감귤 3kg", 10, 5), stock(2, "충전기", 5, 5)]);
    await screen.findByRole("row", { name: /충전기/ });

    expect(alertLine()).not.toBeInTheDocument();
  });

  it("알림 줄을 누르면 미만 상품만 보이고 다시 누르면 전체로 돌아온다", async () => {
    openInventory(SAMPLE);
    const line = await screen.findByRole("button", { name: "안전재고 미만 2개" });

    await userEvent.click(line);
    expect(screen.queryByRole("row", { name: /제주 감귤/ })).not.toBeInTheDocument();
    expect(screen.getByRole("row", { name: /충전기/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /백미/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "안전재고 미만 2개" }));
    expect(screen.getByRole("row", { name: /제주 감귤/ })).toBeInTheDocument();
  });

  it("필터를 켠 채 입고로 안전재고 이상이 되면 그 행이 사라지고 알림 개수가 1 줄어든다", async () => {
    openInventory(SAMPLE);
    await userEvent.click(await screen.findByRole("button", { name: "안전재고 미만 2개" }));

    await userEvent.click(screen.getByRole("button", { name: "충전기" }));
    await userEvent.click(screen.getByRole("button", { name: "입고 등록" }));
    const drawer = screen.getByRole("dialog", { name: "입고 등록" });
    await userEvent.type(within(drawer).getByLabelText("입고 수량"), "2");
    await userEvent.click(within(drawer).getByRole("button", { name: "입고 등록" }));

    await waitFor(() => {
      expect(screen.queryByRole("row", { name: /충전기/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "안전재고 미만 1개" })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /백미/ })).toBeInTheDocument();
  });

  it("마지막 미만 상품까지 채우면 알림 줄이 사라지고 전체 목록이 보인다", async () => {
    openInventory([stock(1, "제주 감귤 3kg", 10, 5), stock(2, "충전기", 3, 5)]);
    await userEvent.click(await screen.findByRole("button", { name: "안전재고 미만 1개" }));

    await userEvent.click(screen.getByRole("button", { name: "충전기" }));
    await userEvent.click(screen.getByRole("button", { name: "입고 등록" }));
    const drawer = screen.getByRole("dialog", { name: "입고 등록" });
    await userEvent.type(within(drawer).getByLabelText("입고 수량"), "2");
    await userEvent.click(within(drawer).getByRole("button", { name: "입고 등록" }));

    await waitFor(() => {
      expect(alertLine()).not.toBeInTheDocument();
    });
    expect(screen.getByRole("row", { name: /제주 감귤/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /충전기/ })).toBeInTheDocument();
  });

  it("입출고 이력에 취소 복구 줄이 주문 번호와 함께 늘어난 수량으로 보인다", async () => {
    openInventory(SAMPLE);
    api.on("GET /api/admin/inventory/2/movements", () => ({
      json: {
        item: SAMPLE[1],
        movements: [{ id: 2, kind: "restock", quantityDelta: 2, quantityAfter: 3, orderNumber: "GM-20261114-0007", memo: null, createdByName: null, createdAt: "2026-11-14T03:05:00.000Z" }],
      },
    }));
    await userEvent.click(await screen.findByRole("button", { name: "충전기" }));

    const history = await screen.findByRole("complementary", { name: "입출고 이력" });
    expect(await within(history).findByText(/취소 복구 · 주문 GM-20261114-0007/)).toBeInTheDocument();
    expect(within(history).getByText("+2")).toBeInTheDocument();
  });
});
