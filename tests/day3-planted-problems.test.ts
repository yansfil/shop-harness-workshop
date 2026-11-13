import path from "node:path";
import { ROUTES, buildPath } from "@grabmarket/contracts";
import { describe, expect, it } from "vitest";
import { gradeAll } from "../tools/grader/src/grade.ts";
import { ACCOUNT, createTestApp, loginAs, orderBody, PRODUCT } from "./support/test-app.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TODAY = "2026-11-14";

function balanceOf(db: ReturnType<typeof createTestApp>["db"], userId: number): number {
  const row = db.prepare("SELECT balance FROM point_balances WHERE user_id = ?").get(userId) as { balance: number } | undefined;
  return row?.balance ?? 0;
}

function giveBalance(db: ReturnType<typeof createTestApp>["db"], userId: number, balance: number): void {
  db.prepare("INSERT INTO point_balances (user_id, balance, updated_at) VALUES (?, ?, ?)").run(userId, balance, "2026-11-14T00:00:00.000Z");
}

describe("정산 반올림", () => {
  it("쿠폰 할인이 있는 3줄 주문의 일별 정산, 월별 정산, 실제 결제 금액이 같다", async () => {
    const { app, db } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    const lines = [PRODUCT.tangerine, PRODUCT.charger, PRODUCT.socks].map((productId) => ({ productId, quantity: 1 }));
    const { order } = (await customer.post(ROUTES.orders).send(orderBody(lines)).expect(201)).body as { order: { id: number; total: number } };
    const couponDiscount = 3;
    const paid = order.total - couponDiscount;
    db.prepare(
      "INSERT INTO order_payments (order_id, coupon_id, coupon_discount, point_used, paid_amount, reward_points, refunded_amount, refund_status, created_at, updated_at) VALUES (?, NULL, ?, 0, ?, 0, 0, 'none', ?, ?)",
    ).run(order.id, couponDiscount, paid, "2026-11-14T03:00:00.000Z", "2026-11-14T03:00:00.000Z");

    const daily = (await admin.get(`/api/admin/settlements/daily?from=${TODAY}&to=${TODAY}`).expect(200)).body as { total: { netAmount: number; couponDiscount: number } };
    const monthly = (await admin.get("/api/admin/settlements/monthly").expect(200)).body as { total: { netAmount: number; couponDiscount: number } };

    expect(daily.total.couponDiscount).toBe(couponDiscount);
    expect(daily.total.netAmount).toBe(paid);
    expect(monthly.total.netAmount).toBe(paid);
  });
});

describe("포인트 결제 주문 취소", () => {
  it("포인트로 결제한 주문을 취소하면 쓴 포인트가 그대로 돌아온다", async () => {
    const { app, db } = createTestApp();
    giveBalance(db, 2, 5000);
    const customer = await loginAs(app, ACCOUNT.customerA);
    const placed = await customer.post("/api/checkout").send({ ...orderBody([{ productId: PRODUCT.tangerine, quantity: 1 }]), usePoints: 3000 }).expect(201);
    expect(balanceOf(db, 2)).toBe(2000);

    await customer.post(buildPath(ROUTES.orderCancel, { orderId: (placed.body as { order: { id: number } }).order.id })).send({}).expect(200);

    expect(balanceOf(db, 2)).toBe(5000);
  });
});

describe("남의 주문 조회", () => {
  it("다른 고객의 주문 상세(order-extras)는 찾을 수 없다고 나온다", async () => {
    const { app } = createTestApp();
    const owner = await loginAs(app, ACCOUNT.customerA);
    const other = await loginAs(app, ACCOUNT.customerB);
    const { order } = (await owner.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.tangerine, quantity: 1 }])).expect(201)).body as { order: { id: number } };

    await other.get(`/api/order-extras/${order.id}`).expect(404);
    await owner.get(`/api/order-extras/${order.id}`).expect(200);
  });
});

describe("관리자 정산 API 권한", () => {
  it.each(["/api/admin/settlements/daily", "/api/admin/settlements/monthly"])("고객은 %s를 볼 수 없다", async (url) => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);

    await customer.get(url).expect(403);
    await admin.get(url).expect(200);
  });
});

describe("정산 검색어", () => {
  it("검색어에 SQL 조각을 넣어도 조건이 늘어나지 않고 글자 그대로 찾는다", async () => {
    const { app } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);
    const admin = await loginAs(app, ACCOUNT.admin);
    await customer.post(ROUTES.orders).send(orderBody([{ productId: PRODUCT.tangerine, quantity: 1 }])).expect(201);

    const injected = await admin.get(`/api/admin/settlements/daily?from=${TODAY}&to=${TODAY}&q=${encodeURIComponent("x' OR '1'='1")}`).expect(200);
    const byName = await admin.get(`/api/admin/settlements/daily?from=${TODAY}&to=${TODAY}&q=${encodeURIComponent("김하늘")}`).expect(200);

    expect((injected.body as { total: { orderCount: number } }).total.orderCount).toBe(0);
    expect((byName.body as { total: { orderCount: number } }).total.orderCount).toBe(1);
  });
});

describe("포인트 적립", () => {
  it("요청에 적립액을 실어 보내도 서버가 결제 금액의 1%로 정한다", async () => {
    const { app, db } = createTestApp();
    const customer = await loginAs(app, ACCOUNT.customerA);

    const response = await customer.post("/api/checkout").send({ ...orderBody([{ productId: PRODUCT.tangerine, quantity: 1 }]), rewardPoints: 999_999 }).expect(201);

    const paidAmount = (response.body as { payment: { paidAmount: number } }).payment.paidAmount;
    expect(paidAmount).toBe(20_900);
    expect((response.body as { payment: { rewardPoints: number } }).payment.rewardPoints).toBe(209);
    expect(balanceOf(db, 2)).toBe(209);
  });
});

describe("쿠폰·포인트 결제", () => {
  it("재고가 모자라게 된 결제는 거절하고 재고는 0 아래로 내려가지 않는다", async () => {
    const { app, db } = createTestApp();
    giveBalance(db, 2, 5000);
    giveBalance(db, 3, 5000);
    const a = await loginAs(app, ACCOUNT.customerA);
    const b = await loginAs(app, ACCOUNT.customerB);
    const body = (): Record<string, unknown> => ({ ...orderBody([{ productId: PRODUCT.charger, quantity: 2 }]), usePoints: 100 });

    const results = await Promise.all([a.post("/api/checkout").send(body()), b.post("/api/checkout").send(body())]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const stock = db.prepare("SELECT quantity FROM inventory WHERE product_id = ?").get(PRODUCT.charger) as { quantity: number };
    expect(stock.quantity).toBe(1);
  });

  it("주문 번호의 날짜는 주입한 시계를 따른다", async () => {
    const { app, db } = createTestApp();
    giveBalance(db, 2, 5000);
    const customer = await loginAs(app, ACCOUNT.customerA);

    const response = await customer.post("/api/checkout").send({ ...orderBody([{ productId: PRODUCT.tangerine, quantity: 1 }]), usePoints: 100 }).expect(201);

    expect((response.body as { order: { orderNumber: string } }).order.orderNumber).toBe("GM-20261114-0001");
  });
});

describe("계층 경계와 시계", () => {
  it("계층 import 방향 위반이 없다", () => {
    const found = gradeAll(REPO_ROOT).violations.filter((violation) => violation.rule === "layer-import");
    expect(found.map((violation) => `${violation.file}:${String(violation.line)}`)).toEqual([]);
  });

  it("new Date()를 직접 부르는 곳이 없다", () => {
    const found = gradeAll(REPO_ROOT).violations.filter((violation) => violation.rule === "new-date");
    expect(found.map((violation) => `${violation.file}:${String(violation.line)}`)).toEqual([]);
  });
});
