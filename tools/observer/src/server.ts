// 세션 뷰어 로컬 서버. loopback(127.0.0.1)에서만 듣는다.
// 화면(tools/observer/web)과 JSON API를 내고, 기록 폴더가 바뀌면 SSE(/events)로 화면에 알린다.
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { GradeError } from "../../grader/src/git.ts";
import { gradeAll, gradeSinceStart, type GradeResult } from "../../grader/src/grade.ts";
import type { SessionStore } from "./store.ts";

export const HOST = "127.0.0.1";
/** 기록 폴더를 다시 보는 간격. */
export const POLL_MS = 400;
/** 동시에 붙어 있는 화면(SSE 연결) 최대 수. 넘으면 가장 오래된 연결을 닫는다. */
export const MAX_EVENT_CLIENTS = 16;
const HEARTBEAT_MS = 15_000;

const WEB_DIR = path.resolve(import.meta.dirname, "..", "web");

export type GradeOutcome = { status: "ok"; result: GradeResult } | { status: "error"; message: string };

export function runGrade(repoRoot: string, all: boolean): GradeOutcome {
  try {
    return { status: "ok", result: all ? gradeAll(repoRoot) : gradeSinceStart(repoRoot) };
  } catch (error) {
    if (error instanceof GradeError) return { status: "error", message: error.message };
    throw error;
  }
}

const STATIC: Record<string, { file: string; type: string }> = {
  "/": { file: path.join(WEB_DIR, "index.html"), type: "text/html; charset=utf-8" },
  "/app.js": { file: path.join(WEB_DIR, "app.js"), type: "text/javascript; charset=utf-8" },
  "/app.css": { file: path.join(WEB_DIR, "app.css"), type: "text/css; charset=utf-8" },
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

export interface ViewerServer {
  url: string;
  close: () => Promise<void>;
}

export async function startViewerServer(options: { store: SessionStore; repoRoot: string; port: number }): Promise<ViewerServer> {
  const { store, repoRoot } = options;
  const clients = new Set<ServerResponse>();
  const fontFile = path.join(repoRoot, "apps", "web", "src", "assets", "fonts", "PretendardVariable.woff2");
  store.refresh();

  const broadcast = (event: string, data: unknown): void => {
    for (const client of clients) client.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const openEvents = (req: IncomingMessage, res: ServerResponse): void => {
    if (clients.size >= MAX_EVENT_CLIENTS) {
      const oldest = clients.values().next().value;
      if (oldest !== undefined) {
        clients.delete(oldest);
        oldest.end();
      }
    }
    res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", connection: "keep-alive" });
    res.write("retry: 2000\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
  };

  const handle = (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    const route = url.pathname;
    const asset = STATIC[route];
    if (asset !== undefined) {
      res.writeHead(200, { "content-type": asset.type, "cache-control": "no-store" });
      res.end(readFileSync(asset.file));
      return;
    }
    if (route === "/fonts/PretendardVariable.woff2") {
      res.writeHead(200, { "content-type": "font/woff2", "cache-control": "max-age=86400" });
      res.end(readFileSync(fontFile));
      return;
    }
    if (route === "/events") {
      openEvents(req, res);
      return;
    }
    if (route === "/api/sessions") {
      sendJson(res, 200, { configDir: store.paths.configDir, sessions: store.list() });
      return;
    }
    const sessionMatch = /^\/api\/sessions\/([A-Za-z0-9-]+)(?:\/(compare|instructions))?$/.exec(route);
    if (sessionMatch !== null) {
      const id = sessionMatch[1] ?? "";
      const body = sessionMatch[2] === "compare" ? store.compare(id) : sessionMatch[2] === "instructions" ? store.instructions(id) : store.detail(id);
      if (body === null) sendJson(res, 404, { error: "세션을 찾을 수 없어요" });
      else sendJson(res, 200, body);
      return;
    }
    if (route === "/api/grade") {
      sendJson(res, 200, runGrade(repoRoot, url.searchParams.get("all") === "1"));
      return;
    }
    sendJson(res, 404, { error: "없는 주소예요" });
  };

  const server = createServer((req, res) => {
    try {
      handle(req, res);
    } catch (error) {
      console.error("[viewer] 요청 처리 실패", req.url, error);
      if (!res.headersSent) sendJson(res, 500, { error: "화면 자료를 만들지 못했어요. 뷰어 터미널의 오류를 보세요" });
      else res.end();
    }
  });

  const poll = setInterval(() => {
    const changed = store.refresh();
    if (changed.length > 0) broadcast("change", { ids: changed });
  }, POLL_MS);
  const heartbeat = setInterval(() => {
    for (const client of clients) client.write(": ping\n\n");
  }, HEARTBEAT_MS);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    url: `http://${HOST}:${port}/`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        clearInterval(poll);
        clearInterval(heartbeat);
        for (const client of clients) client.end();
        clients.clear();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
