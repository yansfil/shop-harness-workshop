import { FixedClock } from "@grabmarket/shared";
import { type Database, openMemoryDatabase } from "./connection.ts";
import { migrate } from "./migrate.ts";

/** 테스트용: 모든 마이그레이션을 적용한 빈 메모리 DB. 시드는 넣지 않는다. */
export function createTestDatabase(): Database {
  const db = openMemoryDatabase();
  migrate(db, new FixedClock("2026-11-01T00:00:00.000Z"));
  return db;
}
