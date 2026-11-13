import { ApiErrorResponseSchema, OrderResponseSchema, ROUTES, buildPath } from "@grabmarket/contracts";
import { describe, expect, it } from "vitest";
import { ACCOUNT, createTestApp, loginAs, orderBody, PRODUCT } from "./support/test-app.ts";

async function stockOf(admin: Awaited<ReturnType<typeof loginAs>>, productId: number): Promise<number> {
  const response = await admin.get(ROUTES.adminInventory).expect(200);
  const item = (response.body as { items: { productId: number; quantity: number }[] }).items.find((candidate) => candidate.productId === productId);
  return item?.quantity ?? Number.NaN;
}

describe("주문 취소", () => {
  it("결제완료 주문을 취소하면 취소됨이 되고 재고와 결제 금액이 돌아온다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const { order } = OrderResponseSchema.parse((await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.tangerine, quantity: 2 }])).expect(201)).body);
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(8);

    const cancelled = await customer.post(buildPath(ROUTES.orderCancel, { orderId: order.id })).send({ reason: "단순 변심" }).expect(200);

    expect(OrderResponseSchema.parse(cancelled.body).order.status).toBe("cancelled");
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(10);
    const detail = await customer.get(`/api/order-extras/${order.id}`).expect(200);
    expect((detail.body as { payment: unknown }).payment).toMatchObject({ paidAmount: order.total, refundedAmount: order.total, refundStatus: "full" });
  });

  it("배송중부터는 취소를 거절하고 상태와 재고가 그대로다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const { order } = OrderResponseSchema.parse((await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.tangerine, quantity: 2 }])).expect(201)).body);
    for (const status of ["preparing", "shipping"]) {
      await admin.post(buildPath(ROUTES.adminOrderStatus, { orderId: order.id })).send({ status }).expect(200);
    }

    const response = await customer.post(buildPath(ROUTES.orderCancel, { orderId: order.id })).send({}).expect(409);

    expect(ApiErrorResponseSchema.parse(response.body).error.code).toBe("ORDER_NOT_CANCELLABLE");
    const after = OrderResponseSchema.parse((await customer.get(buildPath(ROUTES.order, { orderId: order.id })).expect(200)).body);
    expect(after.order.status).toBe("shipping");
    expect(await stockOf(admin, PRODUCT.tangerine)).toBe(8);
  });
});
