import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { FixedClock } from "@grabmarket/shared";
import { afterEach, describe, expect, it } from "vitest";
import { openMemoryDatabase } from "./connection.ts";
import { migrate } from "./migrate.ts";
import { createTestDatabase } from "./testing.ts";

const clock = new FixedClock("2026-11-01T00:00:00.000Z");
const tempDirs: string[] = [];

function migrationsDir(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "grabmarket-migrations-"));
  tempDirs.push(dir);
  for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(dir, name), sql);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("migrate", () => {
  it("마이그레이션을 모두 적용하면 앱 테이블이 모두 생긴다", () => {
    const db = createTestDatabase();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(
      (row) => row.name,
    );
    expect(tables).toEqual([
      "announcements",
      "batch_run_logs",
      "batch_runs",
      "categories",
      "coupon_redemptions",
      "coupon_wallet",
      "coupons",
      "inventory",
      "inventory_movements",
      "notification_queue",
      "notification_settings",
      "notifications",
      "order_cancellations",
      "order_items",
      "order_payments",
      "orders",
      "point_balances",
      "point_campaigns",
      "point_ledger",
      "products",
      "return_request_items",
      "return_requests",
      "return_shipments",
      "schema_migrations",
      "sessions",
      "settlement_adjustments",
      "settlement_daily",
      "shipments",
      "users",
    ]);
  });

  it("적용한 번호는 다시 적용하지 않고 새 번호만 적용한다", () => {
    const db = openMemoryDatabase();
    const first = { "0001_a.sql": "CREATE TABLE a (id INTEGER);" };
    expect(migrate(db, clock, migrationsDir(first))).toEqual([1]);
    expect(migrate(db, clock, migrationsDir({ ...first, "0002_b.sql": "CREATE TABLE b (id INTEGER);" }))).toEqual([2]);
  });

  it("이미 적용한 파일의 내용이 바뀌면 멈춘다", () => {
    const db = openMemoryDatabase();
    migrate(db, clock, migrationsDir({ "0001_a.sql": "CREATE TABLE a (id INTEGER);" }));
    expect(() => migrate(db, clock, migrationsDir({ "0001_a.sql": "CREATE TABLE a (id INTEGER, name TEXT);" }))).toThrow(
      "새 번호 파일로 추가",
    );
  });

  it("실패한 마이그레이션은 되돌리고 기록하지 않는다", () => {
    const db = openMemoryDatabase();
    expect(() => migrate(db, clock, migrationsDir({ "0001_bad.sql": "CREATE TABLE ok (id INTEGER); NOT SQL;" }))).toThrow();
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE name IN ('ok', 'schema_migrations')").all();
    expect(rows).toEqual([{ name: "schema_migrations" }]);
  });
});
