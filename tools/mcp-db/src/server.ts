// 읽기 전용 DB MCP 서버(stdio). 도구는 셋뿐이다: list_tables, describe_table, query(SELECT만).
// stdout은 프로토콜 전용이므로 로그는 stderr로만 쓴다.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "../../../apps/api/src/config.ts";
import { ReadOnlyDatabase } from "./database-tools.ts";

const { databasePath } = loadConfig();
let database: ReadOnlyDatabase | undefined;

/** 처음 도구를 부를 때 연다. DB 파일이 아직 없어도 서버는 뜬다. */
function open(): ReadOnlyDatabase {
  database ??= new ReadOnlyDatabase(databasePath);
  return database;
}

function reply(run: () => unknown): { content: { type: "text"; text: string }[]; isError?: true } {
  try {
    return { content: [{ type: "text", text: JSON.stringify(run(), null, 2) }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: `실패: ${message}` }], isError: true };
  }
}

const server = new McpServer({ name: "grabmarket-db", version: "1.0.0" });

server.registerTool("list_tables", { description: "그랩마켓 DB의 테이블 목록과 행 수를 돌려준다." }, () => reply(() => open().listTables()));

server.registerTool(
  "describe_table",
  { description: "테이블의 컬럼(이름·타입·NOT NULL·기본값·PK), 외래 키, 인덱스를 돌려준다.", inputSchema: { table: z.string().describe("list_tables에 나온 테이블 이름") } },
  ({ table }) => reply(() => open().describeTable(table)),
);

server.registerTool(
  "query",
  { description: "SELECT 문 하나를 실행한다(읽기 전용, 최대 200줄). INSERT·UPDATE·DELETE 같은 쓰기 SQL은 거절된다.", inputSchema: { sql: z.string().describe("SELECT 문 하나") } },
  ({ sql }) => reply(() => open().query(sql)),
);

function shutdown(): void {
  database?.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("end", shutdown);

await server.connect(new StdioServerTransport());
console.error(`그랩마켓 DB MCP 서버(읽기 전용): ${databasePath}`);
