import { existsSync } from "node:fs";
import path from "node:path";
import { fingerprintDatabase, openMemoryDatabase } from "@grabmarket/db";
import { systemClock } from "@grabmarket/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { REPO_ROOT } from "../config.ts";
import { composeServices } from "../composition.ts";
import { OrderSimulator } from "./order-simulator.ts";
import { Prng } from "./prng.ts";
import { resetAndSeedDatabase } from "./seed-database.ts";

const db = openMemoryDatabase();
let first: ReturnType<typeof fingerprintDatabase>;

describe("결정적 시드", () => {
  beforeAll(() => {
    resetAndSeedDatabase(db);
    first = fingerprintDatabase(db);
  }, 60_000);

  it("두 번 채워도 모든 행이 같고 규모는 계약대로다", () => {
    resetAndSeedDatabase(db);
    const second = fingerprintDatabase(db);

    expect(second.hash).toBe(first.hash);
    expect(second.rowCounts).toMatchObject({ users: 203, categories: 4, products: 120, inventory: 120, orders: 5000 });
  }, 60_000);

  it("품절·남은 수량 적음·안전재고 미만 상품이 섞여 있고 변형마다 다른 상품 이미지 120장이 레포에 있다", () => {
    const stock = db.prepare("SELECT SUM(quantity = 0) AS soldOut, SUM(quantity BETWEEN 1 AND 5) AS low, SUM(quantity > 5 AND quantity < safety_stock) AS belowSafety FROM inventory").get();
    expect(stock?.soldOut).toBeGreaterThan(0);
    expect(stock?.low).toBeGreaterThan(0);
    expect(stock?.belowSafety).toBeGreaterThan(0);

    const images = (db.prepare("SELECT DISTINCT image_path FROM products").all() as unknown as { image_path: string }[]).map((row) => row.image_path);
    expect(images).toHaveLength(120);
    expect(images.filter((image) => !existsSync(path.join(REPO_ROOT, "apps", "web", "public", image)))).toEqual([]);
  });

  it("주문은 180일에 걸쳐 있고 같은 시각의 묶음이 있다", () => {
    const span = db.prepare("SELECT MIN(created_at) AS first, MAX(created_at) AS last FROM orders").get();
    expect(Date.parse(String(span?.last)) - Date.parse(String(span?.first))).toBeGreaterThan(170 * 24 * 3600 * 1000);
    const sameTime = db.prepare("SELECT COUNT(*) AS n FROM (SELECT created_at FROM orders GROUP BY created_at HAVING COUNT(*) > 1)").get();
    expect(sameTime?.n).toBeGreaterThan(0);
  });

  it("시뮬레이터가 부를 때마다 새 주문이 하나씩 늘고 재고 이력도 남는다", () => {
    const { orders, catalog } = composeServices({ db, clock: systemClock });
    const customers = [{ id: 2, email: "customer1@grabmarket.test", name: "김하늘", role: "customer" as const, phone: "010-1234-5678", address: "서울특별시 한울구 새벽로 12, 302호" }];
    const simulator = new OrderSimulator(orders, catalog, customers, new Prng(1), systemClock);
    const count = () => (db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number }).n;
    const movements = () => (db.prepare("SELECT COUNT(*) AS n FROM inventory_movements").get() as { n: number }).n;
    const [ordersBefore, movementsBefore] = [count(), movements()];

    simulator.placeOne();
    simulator.placeOne();

    expect(count()).toBe(ordersBefore + 2);
    expect(movements()).toBeGreaterThan(movementsBefore);
  });
});
