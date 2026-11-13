import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

/** 파일 DB를 연다. 폴더가 없으면 만든다. 외래 키를 켜고 WAL로 쓴다. */
export function openDatabase(filePath: string): Database {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  enableForeignKeys(db);
  return db;
}

export function openMemoryDatabase(): Database {
  const db = new DatabaseSync(":memory:");
  enableForeignKeys(db);
  return db;
}

function enableForeignKeys(db: Database): void {
  db.exec("PRAGMA foreign_keys = ON;");
}

/** fn을 한 트랜잭션으로 실행한다. 예외가 나면 되돌리고 그 예외를 다시 던진다. */
export function inTransaction<T>(db: Database, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
