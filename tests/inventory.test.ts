import { ApiErrorResponseSchema, InboundResponseSchema, InventoryListResponseSchema, InventoryMovementsResponseSchema, ROUTES, buildPath } from "@grabmarket/contracts";
import request from "supertest";
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

describe("안전재고 미만 표시", () => {
  const listOf = async (agent: Awaited<ReturnType<typeof loginAs>>) => InventoryListResponseSchema.parse((await agent.get(ROUTES.adminInventory).expect(200)).body).items;

  it("수량이 안전재고보다 적은 상품은 safetyStock과 lowStock: true를 준다", async () => {
    const { app, db } = createTestApp();
    db.prepare("UPDATE inventory SET safety_stock = 10, quantity = 9 WHERE product_id = ?").run(PRODUCT.tangerine);
    const admin = await loginAs(app, ACCOUNT.admin);

    const item = (await listOf(admin)).find((candidate) => candidate.productId === PRODUCT.tangerine);

    expect(item).toMatchObject({ quantity: 9, safetyStock: 10, lowStock: true });
  });

  it.each([
    { quantity: 10, safetyStock: 10, lowStock: false },
    { quantity: 11, safetyStock: 10, lowStock: false },
    { quantity: 9, safetyStock: 10, lowStock: true },
  ])("수량 $quantity, 안전재고 $safetyStock이면 lowStock은 $lowStock이다", async ({ quantity, safetyStock, lowStock }) => {
    const { app, db } = createTestApp();
    db.prepare("UPDATE inventory SET safety_stock = ?, quantity = ? WHERE product_id = ?").run(safetyStock, quantity, PRODUCT.tangerine);
    const admin = await loginAs(app, ACCOUNT.admin);

    const item = (await listOf(admin)).find((candidate) => candidate.productId === PRODUCT.tangerine);

    expect(item?.lowStock).toBe(lowStock);
  });

  it("품절 상품은 안전재고 미만이다", async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);

    const item = (await listOf(admin)).find((candidate) => candidate.productId === PRODUCT.rice);

    expect(item).toMatchObject({ quantity: 0, lowStock: true });
  });

  it("안전재고 이상이 되도록 입고하면 입고 응답과 이어진 목록 모두 lowStock: false다", async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);
    const before = (await listOf(admin)).find((candidate) => candidate.productId === PRODUCT.charger);
    expect(before).toMatchObject({ quantity: 3, safetyStock: 5, lowStock: true });

    const inbound = InboundResponseSchema.parse(
      (await admin.post(buildPath(ROUTES.adminInventoryInbound, { productId: PRODUCT.charger })).send({ idempotencyKey: crypto.randomUUID(), quantity: 2 }).expect(201)).body,
    );

    expect(inbound.item).toMatchObject({ quantity: 5, lowStock: false });
    expect((await listOf(admin)).find((candidate) => candidate.productId === PRODUCT.charger)?.lowStock).toBe(false);
  });

  it("이력 응답의 item에도 safetyStock과 lowStock이 있다", async () => {
    const { app } = createTestApp();
    const admin = await loginAs(app, ACCOUNT.admin);

    const history = InventoryMovementsResponseSchema.parse((await admin.get(buildPath(ROUTES.adminInventoryMovements, { productId: PRODUCT.charger })).expect(200)).body);

    expect(history.item).toMatchObject({ safetyStock: 5, lowStock: true });
  });

  it("고객과 로그인하지 않은 요청은 재고 목록을 볼 수 없다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    await customer.get(ROUTES.adminInventory).expect(403);
    await request(app).get(ROUTES.adminInventory).expect(401);
  });
});
