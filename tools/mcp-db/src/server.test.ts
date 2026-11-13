import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { migrate, openDatabase } from "@grabmarket/db";
import { FixedClock } from "@grabmarket/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertReadOnlySelect } from "./read-only-sql.ts";

const directory = mkdtempSync(path.join(tmpdir(), "mcp-db-test-"));
const databasePath = path.join(directory, "test.sqlite");
let client: Client;

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const [first] = result.content as { type: string; text: string }[];
  return first?.text ?? "";
}

beforeAll(async () => {
  const db = openDatabase(databasePath);
  migrate(db, new FixedClock("2026-11-01T00:00:00.000Z"));
  db.prepare("INSERT INTO categories (slug, name, sort_order) VALUES ('food', '식품', 1)").run();
  db.close();
  client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve(import.meta.dirname, "server.ts")], env: { DATABASE_PATH: databasePath } }));
}, 30_000);

afterAll(async () => {
  await client.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("DB MCP 서버(stdio)", () => {
  it("도구는 list_tables, describe_table, query 셋뿐이다", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["describe_table", "list_tables", "query"]);
  });

  it("테이블 목록과 구조와 SELECT 결과를 돌려준다", async () => {
    expect(JSON.parse(text(await client.callTool({ name: "list_tables", arguments: {} }))) as unknown).toContainEqual({ name: "categories", rows: 1 });
    expect(text(await client.callTool({ name: "describe_table", arguments: { table: "orders" } }))).toContain("order_number");
    expect(JSON.parse(text(await client.callTool({ name: "query", arguments: { sql: "SELECT slug, name FROM categories" } }))) as unknown).toEqual({ columns: ["slug", "name"], rows: [["food", "식품"]], truncated: false });
  });

  it("쓰기 SQL은 거절하고 데이터는 그대로다", async () => {
    for (const sql of ["INSERT INTO categories (slug, name, sort_order) VALUES ('x', 'x', 9)", "DELETE FROM categories", "DROP TABLE orders", "SELECT 1; DELETE FROM categories", "WITH c AS (SELECT 1) DELETE FROM categories", "PRAGMA writable_schema = ON"]) {
      const result = await client.callTool({ name: "query", arguments: { sql } });
      expect(result.isError, sql).toBe(true);
    }
    expect(JSON.parse(text(await client.callTool({ name: "query", arguments: { sql: "SELECT COUNT(*) AS n FROM categories" } }))) as unknown).toMatchObject({ rows: [[1]] });
  });
});

describe("SELECT 문장 검사", () => {
  it("문자열이나 주석 안의 세미콜론과 키워드는 허용하고 두 번째 문장은 거절한다", () => {
    expect(() => {
      assertReadOnlySelect("-- 설명\nSELECT 'a;b' AS x, \"DELETE\" FROM t /* ; */;");
    }).not.toThrow();
    expect(() => {
      assertReadOnlySelect("SELECT 1; SELECT 2");
    }).toThrow("문장이 둘 이상");
    expect(() => {
      assertReadOnlySelect("  update t set a = 1");
    }).toThrow("SELECT로 시작");
  });
});
