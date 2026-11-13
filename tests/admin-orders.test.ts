import { AdminOrderListResponseSchema, ApiErrorResponseSchema, buildPath, ROUTES } from "@grabmarket/contracts";
import { describe, expect, it } from "vitest";
import { ACCOUNT, createTestApp, loginAs, orderBody, PRODUCT, type TestApp } from "./support/test-app.ts";

type Agent = Awaited<ReturnType<typeof loginAs>>;

/** 김하늘·이도윤이 번갈아 주문한 주문 count건을 만든다. 주문마다 stepMs만큼 시계를 움직인다(0이면 모두 같은 시각). */
async function placeOrders({ app, clock }: TestApp, count: number, stepMs = 60_000): Promise<void> {
  const customers = [await loginAs(app, ACCOUNT.customerA), await loginAs(app, ACCOUNT.customerB)];
  for (let index = 0; index < count; index += 1) {
    await customers[index % 2]?.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.socks, quantity: 1 }])).expect(201);
    clock.advance(stepMs);
  }
}

async function listOrders(admin: Agent, query: Record<string, string | number>) {
  const response = await admin.get(ROUTES.adminOrders).query(query).expect(200);
  return AdminOrderListResponseSchema.parse(response.body);
}

async function advanceStatus(admin: Agent, orderId: number, status: string): Promise<void> {
  await admin.post(buildPath(ROUTES.adminOrderStatus, { orderId })).send({ status }).expect(200);
}

describe("관리자 주문 목록: 번호 방식 페이지 나누기", () => {
  it("조건이 없으면 첫 10건과 전체 수, 페이지 수를 준다", async () => {
    const test = createTestApp();
    await placeOrders(test, 25);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    const first = await listOrders(admin, {});
    expect(first).toMatchObject({ total: 25, page: 1, pageSize: 10, pageCount: 3 });
    expect(first.orders).toHaveLength(10);
    expect(first.orders.map((order) => order.id)).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
  });

  it("마지막 페이지는 남은 주문만 주고, 범위를 넘는 페이지는 빈 목록이다", async () => {
    const test = createTestApp();
    await placeOrders(test, 25);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    const last = await listOrders(admin, { page: 3 });
    expect(last.orders.map((order) => order.id)).toEqual([5, 4, 3, 2, 1]);
    expect(last.nextCursor).toBeNull();
    const beyond = await listOrders(admin, { page: 4 });
    expect(beyond).toMatchObject({ total: 25, pageCount: 3, orders: [] });
  });
});

describe("관리자 주문 목록: 상태 필터와 검색", () => {
  it("상태로 거르면 그 상태의 주문만 오고, 상태별 개수는 필터와 상관없이 같다", async () => {
    const test = createTestApp();
    await placeOrders(test, 6);
    const admin = await loginAs(test.app, ACCOUNT.admin);
    for (const id of [1, 2, 3]) await advanceStatus(admin, id, "preparing");
    await advanceStatus(admin, 1, "shipping");

    const preparing = await listOrders(admin, { status: "preparing" });
    expect(preparing.orders.map((order) => order.id)).toEqual([3, 2]);
    expect(preparing.total).toBe(2);
    const all = await listOrders(admin, {});
    expect(preparing.statusCounts).toEqual({ all: 6, paid: 3, preparing: 2, shipping: 1, delivered: 0 });
    expect(all.statusCounts).toEqual(preparing.statusCounts);
  });

  it("고객 이름이나 주문번호의 일부로 찾는다", async () => {
    const test = createTestApp();
    await placeOrders(test, 5);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    const byName = await listOrders(admin, { q: "이도윤" });
    expect(byName.orders.map((order) => order.customerName)).toEqual(["이도윤", "이도윤"]);
    const byNumber = await listOrders(admin, { q: "0003" });
    expect(byNumber.orders.map((order) => order.orderNumber)).toEqual(["GM-20261114-0003"]);
  });
});

describe("관리자 주문 목록: 커서 방식 페이지 나누기", () => {
  it("nextCursor를 이어 보내면 건너뛰거나 겹치지 않고 모든 주문을 한 번씩 받는다", async () => {
    const test = createTestApp();
    await placeOrders(test, 25);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    const ids: number[] = [];
    let query: Record<string, string> = {};
    let pages = 0;
    for (;;) {
      const page = await listOrders(admin, query);
      ids.push(...page.orders.map((order) => order.id));
      pages += 1;
      if (page.nextCursor === null) break;
      query = { cursor: page.nextCursor };
    }

    expect(pages).toBe(3);
    expect(ids).toEqual(Array.from({ length: 25 }, (_, index) => 25 - index));
  });

  it("커서 방식 응답의 page는 null이다", async () => {
    const test = createTestApp();
    await placeOrders(test, 12);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    const first = await listOrders(admin, {});
    const second = await listOrders(admin, { cursor: first.nextCursor ?? "" });
    expect(second.page).toBeNull();
    expect(second.orders.map((order) => order.id)).toEqual([2, 1]);
  });

  it("형식이 틀린 커서는 400으로 거절한다", async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);
    const response = await admin.get(ROUTES.adminOrders).query({ cursor: "아무거나" }).expect(400);
    expect(ApiErrorResponseSchema.parse(response.body).error.code).toBe("VALIDATION_FAILED");
  });
});

describe("관리자 주문 목록: 경계와 조합", () => {
  it("같은 시각에 들어온 주문도 id 순서가 고정돼서 커서가 페이지 경계에서 건너뛰거나 겹치지 않는다", async () => {
    const test = createTestApp();
    await placeOrders(test, 12, 0);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    const first = await listOrders(admin, { pageSize: 5 });
    const second = await listOrders(admin, { pageSize: 5, cursor: first.nextCursor ?? "" });
    const third = await listOrders(admin, { pageSize: 5, cursor: second.nextCursor ?? "" });

    expect(first.orders.map((order) => order.id)).toEqual([12, 11, 10, 9, 8]);
    expect(second.orders.map((order) => order.id)).toEqual([7, 6, 5, 4, 3]);
    expect(third.orders.map((order) => order.id)).toEqual([2, 1]);
    expect(third.nextCursor).toBeNull();
  });

  it("딱 한 페이지 분량이면 다음 커서가 없다", async () => {
    const test = createTestApp();
    await placeOrders(test, 10);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    const only = await listOrders(admin, {});
    expect(only).toMatchObject({ total: 10, pageCount: 1, nextCursor: null });
  });

  it("상태와 검색어를 함께 걸면 둘 다 맞는 주문만 오고, 개수는 검색어만 따른다", async () => {
    const test = createTestApp();
    await placeOrders(test, 6);
    const admin = await loginAs(test.app, ACCOUNT.admin);
    for (const id of [1, 2, 3, 4]) await advanceStatus(admin, id, "preparing");

    const both = await listOrders(admin, { status: "preparing", q: "김하늘" });
    expect(both.orders.map((order) => order.id)).toEqual([3, 1]);
    expect(both.total).toBe(2);
    expect(both.statusCounts).toEqual({ all: 3, paid: 1, preparing: 2, shipping: 0, delivered: 0 });
  });

  it("검색어의 %와 _는 와일드카드가 아니라 글자 그대로 찾는다", async () => {
    const test = createTestApp();
    await placeOrders(test, 3);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    expect((await listOrders(admin, { q: "%" })).total).toBe(0);
    expect((await listOrders(admin, { q: "_" })).total).toBe(0);
  });

  it("검색어 앞뒤 공백은 무시하고, 맞는 주문이 없으면 빈 목록과 0쪽이다", async () => {
    const test = createTestApp();
    await placeOrders(test, 3);
    const admin = await loginAs(test.app, ACCOUNT.admin);

    expect((await listOrders(admin, { q: "  이도윤 " })).total).toBe(1);
    expect(await listOrders(admin, { q: "없는사람" })).toMatchObject({ total: 0, pageCount: 0, orders: [], nextCursor: null });
  });

  it("알 수 없는 상태나 잘못된 쪽·크기는 400으로 거절한다", async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);
    for (const query of [{ status: "cancelled" }, { page: 0 }, { page: "abc" }, { pageSize: 0 }, { pageSize: 101 }]) {
      const response = await admin.get(ROUTES.adminOrders).query(query).expect(400);
      expect(ApiErrorResponseSchema.parse(response.body).error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("고객은 조건을 붙여도 관리자 목록을 볼 수 없다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const response = await customer.get(ROUTES.adminOrders).query({ status: "paid", q: "김" }).expect(403);
    expect(ApiErrorResponseSchema.parse(response.body).error.code).toBe("FORBIDDEN");
  });
});
