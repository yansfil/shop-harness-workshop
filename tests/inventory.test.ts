import { ApiErrorResponseSchema, InboundResponseSchema, InventoryMovementsResponseSchema, ROUTES, buildPath } from "@grabmarket/contracts";
import { describe, expect, it } from "vitest";
import { ACCOUNT, createTestApp, loginAs, PRODUCT } from "./support/test-app.ts";

describe("재고 입고", () => {
  it("입고를 등록하면 수량과 이력이 바로 바뀌고 같은 키로 다시 보내도 한 번만 반영된다", async () => {
    const { app, clock } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);
    const path = buildPath(ROUTES.adminInventoryInbound, { productId: PRODUCT.charger });
    const body = { idempotencyKey: crypto.randomUUID(), quantity: 20, memo: "정기 입고" };

    clock.advance(1000);
    const first = InboundResponseSchema.parse((await admin.post(path).send(body).expect(201)).body);
    const again = InboundResponseSchema.parse((await admin.post(path).send(body).expect(200)).body);

    expect(first.item.quantity).toBe(23);
    expect(again.movement.id).toBe(first.movement.id);
    const history = InventoryMovementsResponseSchema.parse((await admin.get(buildPath(ROUTES.adminInventoryMovements, { productId: PRODUCT.charger })).expect(200)).body);
    expect(history.item.quantity).toBe(23);
    expect(history.movements).toEqual([expect.objectContaining({ kind: "inbound", quantityDelta: 20, quantityAfter: 23, memo: "정기 입고", createdByName: "운영자" })]);
    const reused = await admin.post(path).send({ ...body, quantity: 5 }).expect(409);
    expect(ApiErrorResponseSchema.parse(reused.body).error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("없는 상품의 입고와 이력은 404다", async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);
    await admin.post(buildPath(ROUTES.adminInventoryInbound, { productId: 999 })).send({ idempotencyKey: crypto.randomUUID(), quantity: 1 }).expect(404);
    await admin.get(buildPath(ROUTES.adminInventoryMovements, { productId: 999 })).expect(404);
  });
});
