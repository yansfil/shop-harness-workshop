import { type Database, inTransaction } from "@grabmarket/db";
import type { UnitOfWork } from "../application/unit-of-work.ts";

export class SqliteUnitOfWork implements UnitOfWork {
  readonly #db: Database;
  #depth = 0;

  constructor(db: Database) {
    this.#db = db;
  }

  run<T>(fn: () => T): T {
    if (this.#depth > 0) return fn();
    this.#depth += 1;
    try {
      return inTransaction(this.#db, fn);
    } finally {
      this.#depth -= 1;
    }
  }
}
