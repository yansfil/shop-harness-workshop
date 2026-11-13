import { AdminOrderResponseSchema, ApiErrorResponseSchema, InventoryMovementsResponseSchema, OrderResponseSchema, ROUTES, buildPath } from "@grabmarket/contracts";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ACCOUNT, createTestApp, loginAs, orderBody, PRODUCT } from "./support/test-app.ts";

type Agent = Awaited<ReturnType<typeof loginAs>>;

/** 감귤 2개와 충전기 1개를 주문한다. 재고는 감귤 10 → 8, 충전기 3 → 2. */
async function placeOrder(customer: Agent) {
  const created = await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.tangerine, quantity: 2 }, { productId: PRODUCT.charger, quantity: 1 }])).expect(201);
  return OrderResponseSchema.parse(created.body).order;
}

async function stockOf(admin: Agent, productId: number): Promise<number> {
  const items = (await admin.get(ROUTES.adminInventory).expect(200)).body as { items: { productId: number; quantity: number }[] };
  return items.items.find((item) => item.productId === productId)?.quantity ?? Number.NaN;
}

async function advance(admin: Agent, orderId: number, status: string) {
  await admin.post(buildPath(ROUTES.adminOrderStatus, { orderId })).send({ status }).expect(200);
}

const cancelPath = (orderId: number) => buildPath(ROUTES.orderCancel, { orderId });
const errorCode = (body: unknown) => ApiErrorResponseSchema.parse(body).error.code;

describe("주문 취소", () => {
  it("결제완료 주문을 취소하면 취소 상태가 되고 재고가 주문 수량만큼 되돌아온다", async () => {
    const { app, clock } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customer);
    expect(order.cancellable).toBe(true);

    clock.advance(60_000);
    const cancelled = OrderResponseSchema.parse((await customer.post(cancelPath(order.id)).expect(200)).body).order;

    expect(cancelled).toMatchObject({ status: "cancelled", cancellable: false, updatedAt: "2026-11-14T03:01:00.000Z" });
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(10);
    expect(await stockOf(admin, PRODUCT.charger)).toBe(3);
  });

  it("취소하면 상품마다 취소 복구 이력이 주문 번호와 함께 남는다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customer);

    await customer.post(cancelPath(order.id)).expect(200);

    const history = InventoryMovementsResponseSchema.parse((await admin.get(buildPath(ROUTES.adminInventoryMovements, { productId: PRODUCT.tangerine })).expect(200)).body);
    expect(history.movements.map((movement) => ({ kind: movement.kind, quantityDelta: movement.quantityDelta, quantityAfter: movement.quantityAfter, orderNumber: movement.orderNumber }))).toEqual([
      { kind: "restock", quantityDelta: 2, quantityAfter: 10, orderNumber: order.orderNumber },
      { kind: "outbound", quantityDelta: -2, quantityAfter: 8, orderNumber: order.orderNumber },
    ]);
  });

  it("배송준비 주문도 취소된다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customer);
    await advance(admin, order.id, "preparing");

    const cancelled = OrderResponseSchema.parse((await customer.post(cancelPath(order.id)).expect(200)).body).order;

    expect(cancelled.status).toBe("cancelled");
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(10);
  });

  it.each(["shipping", "delivered"])("%s 주문은 취소할 수 없고 주문과 재고는 그대로다", async (status) => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customer);
    for (const step of status === "shipping" ? ["preparing", "shipping"] : ["preparing", "shipping", "delivered"]) await advance(admin, order.id, step);

    const refused = await customer.post(cancelPath(order.id)).expect(409);

    expect(errorCode(refused.body)).toBe("ORDER_NOT_CANCELLABLE");
    const after = OrderResponseSchema.parse((await customer.get(buildPath(ROUTES.order, { orderId: order.id }))).body).order;
    expect(after).toMatchObject({ status, cancellable: false });
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(8);
  });

  it("이미 취소된 주문을 다시 취소해도 성공이고 재고는 한 번만 늘어난다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customer);

    await customer.post(cancelPath(order.id)).expect(200);
    const again = OrderResponseSchema.parse((await customer.post(cancelPath(order.id)).expect(200)).body).order;

    expect(again.status).toBe("cancelled");
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(10);
    const history = InventoryMovementsResponseSchema.parse((await admin.get(buildPath(ROUTES.adminInventoryMovements, { productId: PRODUCT.tangerine })).expect(200)).body);
    expect(history.movements.filter((movement) => movement.kind === "restock")).toHaveLength(1);
  });

  it("남의 주문은 404, 로그인하지 않으면 401, 관리자 계정은 403이고 재고는 그대로다", async () => {
    const { app } = createTestApp();
    const customerA = await loginAs(app, ACCOUNT.customerA);
    const customerB = await loginAs(app, ACCOUNT.customerB);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customerA);

    expect(errorCode((await customerB.post(cancelPath(order.id)).expect(404)).body)).toBe("NOT_FOUND");
    expect(errorCode((await request(app).post(cancelPath(order.id)).expect(401)).body)).toBe("UNAUTHENTICATED");
    expect(errorCode((await admin.post(cancelPath(order.id)).expect(403)).body)).toBe("FORBIDDEN");
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(8);
    expect(OrderResponseSchema.parse((await customerA.get(buildPath(ROUTES.order, { orderId: order.id }))).body).order.status).toBe("paid");
  });

  it("관리자가 상태 변경으로 취소 상태를 보내도 거절되고 주문과 재고는 그대로다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customer);

    const refused = await admin.post(buildPath(ROUTES.adminOrderStatus, { orderId: order.id })).send({ status: "cancelled" }).expect(409);

    expect(errorCode(refused.body)).toBe("INVALID_STATUS_TRANSITION");
    expect(AdminOrderResponseSchema.parse((await admin.get(buildPath(ROUTES.adminOrder, { orderId: order.id })).expect(200)).body).order.status).toBe("paid");
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(8);
  });

  it("취소된 주문은 관리자에게 다음 단계가 없고 더 이상 넘길 수 없다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customer);
    await customer.post(cancelPath(order.id)).expect(200);

    const detail = AdminOrderResponseSchema.parse((await admin.get(buildPath(ROUTES.adminOrder, { orderId: order.id })).expect(200)).body).order;

    expect(detail).toMatchObject({ status: "cancelled", nextStatus: null });
    await admin.post(buildPath(ROUTES.adminOrderStatus, { orderId: order.id })).send({ status: "preparing" }).expect(409);
  });

  it("주문 조회 응답의 cancellable은 결제완료·배송준비만 true다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const order = await placeOrder(customer);
    const read = async () => OrderResponseSchema.parse((await customer.get(buildPath(ROUTES.order, { orderId: order.id })).expect(200)).body).order.cancellable;

    const seen = [await read()];
    for (const step of ["preparing", "shipping", "delivered"]) {
      await advance(admin, order.id, step);
      seen.push(await read());
    }

    expect(seen).toEqual([true, true, false, false]);
  });
});
