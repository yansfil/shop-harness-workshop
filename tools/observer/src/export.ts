// node viewer.mjs --export <폴더>: 세션 기록을 서버 없이 열 수 있는 HTML 한 파일로 쓴다.
// 화면 코드(app.js·app.css)를 그대로 넣고, 서버 API가 줄 자료를 미리 계산해 함께 싣는다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SessionStore } from "./store.ts";

const WEB_DIR = path.resolve(import.meta.dirname, "..", "web");

/** HTML <script> 안에 넣어도 태그가 닫히지 않게 한다. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function exportSessions(store: SessionStore, outDir: string): string {
  store.refresh();
  const sessions = store.list();
  const responses: Record<string, unknown> = {
    "/api/sessions": { configDir: store.paths.configDir, sessions },
  };
  for (const { id, branch } of sessions) {
    responses[`/api/sessions/${id}`] = store.detail(id);
    responses[`/api/sessions/${id}/instructions`] = store.instructions(id);
    if (branch !== null) responses[`/api/sessions/${id}/compare`] = store.compare(id);
  }
  const snapshot = { responses };

  const html = readFileSync(path.join(WEB_DIR, "index.html"), "utf8")
    .replace('<link rel="stylesheet" href="/app.css" />', () => `<style>\n${readFileSync(path.join(WEB_DIR, "app.css"), "utf8")}\n</style>`)
    .replace('<script src="/app.js" defer></script>', () => `<script>window.OBSERVER_SNAPSHOT = ${inlineJson(snapshot)};</script>\n<script>\n${readFileSync(path.join(WEB_DIR, "app.js"), "utf8")}\n</script>`);
  if (!html.includes("OBSERVER_SNAPSHOT")) throw new Error("index.html에서 app.js 자리를 찾지 못했어요");

  mkdirSync(outDir, { recursive: true });
  const file = path.join(path.resolve(outDir), "index.html");
  writeFileSync(file, html);
  return file;
}
