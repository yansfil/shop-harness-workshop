import { DatabaseSync } from "node:sqlite";
import { assertReadOnlySelect } from "./read-only-sql.ts";

export const MAX_ROWS = 200;

export interface TableSummary {
  name: string;
  rows: number;
}

export interface QueryResult {
  columns: string[];
  rows: unknown[][];
  /** 결과가 MAX_ROWS를 넘어 잘렸으면 true */
  truncated: boolean;
}

export class ReadOnlyDatabase {
  readonly #db: DatabaseSync;

  /** 읽기 전용으로 연다. 이 연결로는 어떤 SQL도 데이터를 바꿀 수 없다. */
  constructor(filePath: string) {
    this.#db = new DatabaseSync(filePath, { readOnly: true });
    this.#db.exec("PRAGMA query_only = ON");
  }

  close(): void {
    this.#db.close();
  }

  listTables(): TableSummary[] {
    return this.#tableNames().map((name) => ({ name, rows: (this.#db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get() as { n: number } | undefined)?.n ?? 0 }));
  }

  describeTable(table: string): { columns: unknown[]; foreignKeys: unknown[]; indexes: unknown[] } {
    if (!this.#tableNames().includes(table)) throw new RangeError(`없는 테이블입니다: ${table}`);
    return {
      columns: this.#db.prepare(`SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info('${table}')`).all(),
      foreignKeys: this.#db.prepare(`SELECT "from", "table", "to" FROM pragma_foreign_key_list('${table}')`).all(),
      indexes: this.#db.prepare(`SELECT name, "unique" FROM pragma_index_list('${table}')`).all(),
    };
  }

  /** SELECT 한 문장만 실행한다. 결과는 MAX_ROWS줄까지만 돌려준다. */
  query(sql: string): QueryResult {
    assertReadOnlySelect(sql);
    const statement = this.#db.prepare(sql);
    const columns = statement.columns().map((column) => column.name);
    const rows: unknown[][] = [];
    let truncated = false;
    statement.setReturnArrays(true);
    for (const row of statement.iterate()) {
      if (rows.length === MAX_ROWS) {
        truncated = true;
        break;
      }
      rows.push(row as unknown as unknown[]);
    }
    return { columns, rows, truncated };
  }

  #tableNames(): string[] {
    const rows = this.#db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as unknown as { name: string }[];
    return rows.map((row) => row.name);
  }
}
