// npm run dev: API(node --watch)와 웹(Vite) 개발 서버를 함께 띄운다.
// 둘 중 하나가 끝나면 나머지도 끝내고, 먼저 끝난 쪽의 종료 코드로 끝난다. Ctrl+C면 둘 다 끝낸다.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const webDir = path.join(root, "apps", "web");
const viteBin = path.join(path.dirname(createRequire(path.join(webDir, "package.json")).resolve("vite/package.json")), "bin", "vite.js");

// 루트 .env가 있으면 두 자식 모두 --env-file로 읽는다(웹의 vite.config는 API 설정 계약 loadConfig를 쓴다).
const envFile = path.join(root, ".env");
const envArgs = existsSync(envFile) ? [`--env-file=${envFile}`] : [];
const children = [
  { name: "api", args: [...envArgs, "--watch", path.join(root, "apps", "api", "src", "main.ts")], cwd: root },
  { name: "web", args: [...envArgs, viteBin], cwd: webDir },
].map(({ name, args, cwd }) => ({ name, process: spawn(process.execPath, args, { cwd, stdio: "inherit" }) }));

let exitCode = null;
function stopAll(code) {
  if (exitCode === null) exitCode = code;
  for (const child of children) {
    if (child.process.exitCode === null && child.process.signalCode === null) child.process.kill();
  }
}

for (const child of children) {
  child.process.on("exit", (code, signal) => {
    if (exitCode === null) console.error(`[dev] ${child.name}이(가) 끝났습니다(${signal ?? code}). 나머지도 끕니다.`);
    stopAll(code ?? 1);
    if (children.every((c) => c.process.exitCode !== null || c.process.signalCode !== null)) process.exit(exitCode ?? 0);
  });
  child.process.on("error", (error) => {
    console.error(`[dev] ${child.name}을(를) 시작하지 못했습니다: ${error.message}`);
    stopAll(1);
  });
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));
