import { OrderQuoteResponseSchema, OrderResponseSchema, ROUTES, buildPath } from "@grabmarket/contracts";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ACCOUNT, createTestApp, loginAs, orderBody, PRODUCT } from "./support/test-app.ts";

type Line = { productId: number; quantity: number };

async function quote(app: Parameters<typeof request>[0], items: Line[]) {
  return OrderQuoteResponseSchema.parse((await request(app).post(ROUTES.orderQuote).send({ items }).expect(200)).body);
}

describe("무료배송 기준 50,000원", () => {
  it("합계 47,800원은 배송비 3,000원이고 무료배송까지 2,200원 남는다", async () => {
    const { app } = createTestApp();
    const items = [
      { productId: PRODUCT.tangerine, quantity: 1 },
      { productId: PRODUCT.charger, quantity: 1 },
      { productId: PRODUCT.socks, quantity: 3 },
    ];

    expect(await quote(app, items)).toMatchObject({ subtotal: 47_800, shippingFee: 3_000, total: 50_800, freeShippingRemaining: 2_200 });
  });

  it("합계가 정확히 50,000원이면 배송비가 없고 남은 금액도 0이다", async () => {
    const { app } = createTestApp();

    expect(await quote(app, [{ productId: PRODUCT.socks, quantity: 10 }])).toMatchObject({ subtotal: 50_000, shippingFee: 0, total: 50_000, freeShippingRemaining: 0 });
  });

  it("예전에는 무료였던 30,000원 이상 50,000원 미만 합계도 배송비 3,000원이다", async () => {
    const { app } = createTestApp();

    expect(await quote(app, [{ productId: PRODUCT.tangerine, quantity: 2 }])).toMatchObject({ subtotal: 35_800, shippingFee: 3_000, total: 38_800, freeShippingRemaining: 14_200 });
  });

  it("주문을 만들면 견적과 같은 배송비가 저장되고 조회해도 그대로다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const items = [{ productId: PRODUCT.tangerine, quantity: 2 }];
    const estimated = await quote(app, items);

    const { order } = OrderResponseSchema.parse((await customer.post(ROUTES.orders).send(orderBody(items)).expect(201)).body);
    const read = OrderResponseSchema.parse((await customer.get(buildPath(ROUTES.order, { orderId: order.id })).expect(200)).body).order;

    expect(order).toMatchObject({ shippingFee: estimated.shippingFee, total: estimated.total });
    expect(read).toMatchObject({ shippingFee: 3_000, total: 38_800 });
  });
});
