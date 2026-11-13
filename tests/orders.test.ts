import { AdminOrderResponseSchema, ApiErrorResponseSchema, MyOrderListResponseSchema, OrderQuoteResponseSchema, OrderResponseSchema, ROUTES, buildPath } from "@grabmarket/contracts";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ACCOUNT, createTestApp, loginAs, orderBody, PRODUCT } from "./support/test-app.ts";

async function stockOf(admin: Awaited<ReturnType<typeof loginAs>>, productId: number): Promise<number> {
  const response = await admin.get(ROUTES.adminInventory).expect(200);
  const item = (response.body as { items: { productId: number; quantity: number }[] }).items.find((candidate) => candidate.productId === productId);
  return item?.quantity ?? Number.NaN;
}

describe("주문 만들기", () => {
  it("주문하면 결제완료 주문이 생기고 재고가 그만큼 줄며 이력이 남는다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);

    const created = await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.tangerine, quantity: 2 }, { productId: PRODUCT.charger, quantity: 1 }])).expect(201);
    const { order } = OrderResponseSchema.parse(created.body);

    expect(order.status).toBe("paid");
    expect(order.orderNumber).toBe("GM-20261114-0001");
    expect(order.subtotal).toBe(17_900 * 2 + 14_900);
    expect(order.shippingFee).toBe(0);
    expect(order.total).toBe(order.subtotal);
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(8);
    expect(await stockOf(admin, PRODUCT.charger)).toBe(2);
    const history = await admin.get(buildPath(ROUTES.adminInventoryMovements, { productId: PRODUCT.tangerine })).expect(200);
    expect(history.body).toMatchObject({ movements: [{ kind: "outbound", quantityDelta: -2, quantityAfter: 8, orderNumber: order.orderNumber }] });
  });

  it("금액은 서버가 계산하고 배송비는 견적과 주문이 같다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const lines = [{ productId: PRODUCT.socks, quantity: 2 }];

    const quote = OrderQuoteResponseSchema.parse((await request(app).post(ROUTES.orderQuote).send({ items: lines }).expect(200)).body);
    const { order } = OrderResponseSchema.parse((await customer.post(ROUTES.orders).send(orderBody(lines)).expect(201)).body);

    expect(quote).toMatchObject({ subtotal: 10_000, shippingFee: 3_000, total: 13_000, shortages: [] });
    expect(order).toMatchObject({ subtotal: quote.subtotal, shippingFee: quote.shippingFee, total: quote.total });
  });

  it("재고가 하나라도 모자라면 전체를 거절하고 재고와 주문이 그대로다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);

    const response = await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.tangerine, quantity: 2 }, { productId: PRODUCT.charger, quantity: 5 }])).expect(409);

    expect(ApiErrorResponseSchema.parse(response.body).error).toMatchObject({
      code: "INSUFFICIENT_STOCK",
      shortages: [{ productId: PRODUCT.charger, requested: 5, available: 3 }],
    });
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(10);
    expect(await stockOf(admin, PRODUCT.charger)).toBe(3);
    expect(MyOrderListResponseSchema.parse((await customer.get(ROUTES.orders).expect(200)).body).orders).toEqual([]);
  });

  it("같은 멱등 키로 다시 보내면 같은 주문을 돌려주고 재고는 한 번만 줄며, 다른 내용이면 거절한다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const body = orderBody([{ productId: PRODUCT.tangerine, quantity: 3 }]);

    const first = await customer.post(ROUTES.orders).send(body).expect(201);
    const again = await customer.post(ROUTES.orders).send(body).expect(200);

    expect(OrderResponseSchema.parse(again.body).order.id).toBe(OrderResponseSchema.parse(first.body).order.id);
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(7);
    const changed = await customer.post(ROUTES.orders).send({ ...body, items: [{ productId: PRODUCT.tangerine, quantity: 1 }] }).expect(409);
    expect(ApiErrorResponseSchema.parse(changed.body).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("관리자 계정은 이유와 함께 거절하고 로그인하지 않으면 401이다", async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);
    const body = orderBody([{ productId: PRODUCT.socks, quantity: 1 }]);

    const asAdmin = await admin.post(ROUTES.orders).send(body).expect(403);
    expect(ApiErrorResponseSchema.parse(asAdmin.body).error).toMatchObject({ code: "ADMIN_CANNOT_ORDER", message: expect.stringContaining("고객 계정") as unknown });
    await request(app).post(ROUTES.orders).send(body).expect(401);
  });

  it("고객은 요청 본문의 고객 ID를 무시하고 세션의 고객으로 주문한다", async () => {
    const { app } = createTestApp();
    const customerA = await loginAs(app, ACCOUNT.customerA);
    const customerB = await loginAs(app, ACCOUNT.customerB);

    await customerA.post(ROUTES.orders).send({ ...orderBody([{ productId: PRODUCT.socks, quantity: 1 }]), customerId: 3 }).expect(201);

    expect(MyOrderListResponseSchema.parse((await customerA.get(ROUTES.orders)).body).orders).toHaveLength(1);
    expect(MyOrderListResponseSchema.parse((await customerB.get(ROUTES.orders)).body).orders).toHaveLength(0);
  });
});

describe("내 주문", () => {
  it("내 주문은 보이고 남의 주문 번호로 들어가면 찾을 수 없다고 나온다", async () => {
    const { app } = createTestApp();
    const customerA = await loginAs(app, ACCOUNT.customerA);
    const customerB = await loginAs(app, ACCOUNT.customerB);
    const { order } = OrderResponseSchema.parse((await customerA.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.socks, quantity: 1 }]))).body);
    const path = buildPath(ROUTES.order, { orderId: order.id });

    expect(OrderResponseSchema.parse((await customerA.get(path).expect(200)).body).order.id).toBe(order.id);
    const others = await customerB.get(path).expect(404);
    expect(ApiErrorResponseSchema.parse(others.body).error.code).toBe("NOT_FOUND");
    await request(app).get(path).expect(401);
  });
});

describe("관리자 주문", () => {
  it("고객 계정은 관리자 API를 부르면 권한 없음으로 거절된다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const { order } = OrderResponseSchema.parse((await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.socks, quantity: 1 }]))).body);

    for (const response of [
      await customer.get(ROUTES.adminOrders),
      await customer.get(buildPath(ROUTES.adminOrder, { orderId: order.id })),
      await customer.post(buildPath(ROUTES.adminOrderStatus, { orderId: order.id })).send({ status: "preparing" }),
      await customer.get(ROUTES.adminInventory),
    ]) {
      expect(response.status).toBe(403);
      expect(ApiErrorResponseSchema.parse(response.body).error.code).toBe("FORBIDDEN");
    }
    await request(createTestApp().app).get(ROUTES.adminOrders).expect(401);
  });

  it("관리자 주문 목록은 모든 고객의 주문을 한 번에 보여 준다", async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);
    for (const email of [ACCOUNT.customerA, ACCOUNT.customerB]) {
      const customer = await loginAs(app, email);
      await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.socks, quantity: 1 }])).expect(201);
    }

    const list = await admin.get(ROUTES.adminOrders).expect(200);
    expect((list.body as { orders: { customerName: string }[] }).orders.map((row) => row.customerName).sort()).toEqual(["김하늘", "이도윤"]);
  });

  it("주문 상태는 바로 다음 단계로만 넘어가고 이미 그 상태면 그대로 둔다", async () => {
    const { app, clock } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const { order } = OrderResponseSchema.parse((await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.socks, quantity: 1 }]))).body);
    const path = buildPath(ROUTES.adminOrderStatus, { orderId: order.id });
    const change = (status: string) => admin.post(path).send({ status });

    const skip = await change("shipping").expect(409);
    expect(ApiErrorResponseSchema.parse(skip.body).error.code).toBe("INVALID_STATUS_TRANSITION");

    clock.advance(60_000);
    const preparing = AdminOrderResponseSchema.parse((await change("preparing").expect(200)).body).order;
    expect(preparing).toMatchObject({ status: "preparing", nextStatus: "shipping", updatedAt: "2026-11-14T03:01:00.000Z" });

    clock.advance(60_000);
    const repeated = AdminOrderResponseSchema.parse((await change("preparing").expect(200)).body).order;
    expect(repeated.updatedAt).toBe(preparing.updatedAt);

    await change("paid").expect(409);
    await change("shipping").expect(200);
    const delivered = AdminOrderResponseSchema.parse((await change("delivered").expect(200)).body).order;
    expect(delivered).toMatchObject({ status: "delivered", nextStatus: null, customer: { name: "김하늘" } });
    await change("paid").expect(409);
    // 고객이 보는 상태도 같다
    expect(OrderResponseSchema.parse((await customer.get(buildPath(ROUTES.order, { orderId: order.id }))).body).order.status).toBe("delivered");
  });
});
