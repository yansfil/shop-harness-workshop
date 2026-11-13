import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Clock } from "@grabmarket/shared";
import { type Database, inTransaction } from "./connection.ts";

export const MIGRATIONS_DIR = path.resolve(import.meta.dirname, "..", "migrations");

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;

export interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

/** migrations 폴더의 `NNNN_이름.sql` 파일을 번호 순서로 읽는다. 번호가 겹치거나 형식이 틀리면 멈춘다. */
export function loadMigrations(dir: string = MIGRATIONS_DIR): Migration[] {
  const migrations: Migration[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".sql")) continue;
    const match = FILE_PATTERN.exec(file);
    if (match?.[1] === undefined || match[2] === undefined) {
      throw new MigrationError(`마이그레이션 파일 이름은 0001_이름.sql 형식이어야 합니다: ${file}`);
    }
    const sql = readFileSync(path.join(dir, file), "utf8").replaceAll("\r\n", "\n");
    migrations.push({
      version: Number(match[1]),
      name: match[2],
      sql,
      checksum: createHash("sha256").update(sql).digest("hex"),
    });
  }
  for (let i = 1; i < migrations.length; i++) {
    const previous = migrations[i - 1];
    const current = migrations[i];
    if (previous !== undefined && current !== undefined && previous.version === current.version) {
      throw new MigrationError(`마이그레이션 번호 ${current.version}이(가) 두 파일에 있습니다`);
    }
  }
  return migrations;
}

interface AppliedRow {
  version: number;
  name: string;
  checksum: string;
}

/**
 * 아직 적용하지 않은 마이그레이션을 번호 순서로 하나씩 트랜잭션 안에서 적용한다.
 * 이미 적용된 파일의 내용이 바뀌었으면 아무것도 적용하지 않고 멈춘다(고치지 말고 새 번호로 추가).
 * 적용한 버전 번호 목록을 돌려준다.
 */
export function migrate(db: Database, clock: Clock, dir: string = MIGRATIONS_DIR): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);
  const migrations = loadMigrations(dir);
  const applied = new Map(
    (db.prepare("SELECT version, name, checksum FROM schema_migrations").all() as unknown as AppliedRow[]).map(
      (row) => [row.version, row],
    ),
  );
  for (const migration of migrations) {
    const row = applied.get(migration.version);
    if (row !== undefined && row.checksum !== migration.checksum) {
      throw new MigrationError(
        `이미 적용된 마이그레이션 ${String(migration.version).padStart(4, "0")}_${row.name}.sql의 내용이 바뀌었습니다. 기존 파일은 되돌리고 새 번호 파일로 추가하세요`,
      );
    }
  }
  const newlyApplied: number[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    inTransaction(db, () => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)").run(
        migration.version,
        migration.name,
        migration.checksum,
        clock.now().toISOString(),
      );
    });
    newlyApplied.push(migration.version);
  }
  return newlyApplied;
}
