import { createHash } from "node:crypto";
import { type Database, inTransaction } from "./connection.ts";

function tableNames(db: Database): string[] {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as unknown as { name: string }[];
  return rows.map((row) => row.name);
}

/** 모든 테이블을 지운다(인덱스는 함께 지워진다). 서버가 같은 파일을 열어 둔 채로도 다시 채울 수 있게 파일은 지우지 않는다. */
export function dropAllTables(db: Database): void {
  db.exec("PRAGMA foreign_keys = OFF");
  try {
    inTransaction(db, () => {
      for (const name of tableNames(db)) db.exec(`DROP TABLE "${name}"`);
    });
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

export interface DatabaseFingerprint {
  /** 모든 테이블의 모든 행을 테이블 이름·행 번호 순서로 읽어 만든 SHA-256 */
  hash: string;
  rowCounts: Record<string, number>;
}

/** 같은 시드면 같은 값이 나오는지 비교하는 데 쓴다. */
export function fingerprintDatabase(db: Database): DatabaseFingerprint {
  const hash = createHash("sha256");
  const rowCounts: Record<string, number> = {};
  for (const name of tableNames(db)) {
    let count = 0;
    hash.update(`#${name}\n`);
    for (const row of db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).iterate()) {
      hash.update(`${JSON.stringify(row)}\n`);
      count += 1;
    }
    rowCounts[name] = count;
  }
  return { hash: hash.digest("hex"), rowCounts };
}
