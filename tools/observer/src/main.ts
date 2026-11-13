// node viewer.mjs [--port <번호>] [--no-open] [--export <폴더>]
//   기본: 로컬 서버를 띄우고 브라우저로 연다. Ctrl+C로 끝낸다.
//   --export <폴더>: 이 레포의 세션 기록을 <폴더>/index.html 한 파일로 써 넣고 끝낸다(cleanup.mjs가 부른다).
import { spawn } from "node:child_process";
import { REPO_ROOT, resolvePaths } from "./config.ts";
import { exportSessions } from "./export.ts";
import { startViewerServer } from "./server.ts";
import { SessionStore } from "./store.ts";

const DEFAULT_PORT = 4400;

interface Options {
  port: number;
  open: boolean;
  exportDir: string | null;
}

function usage(message: string): never {
  console.error(`${message}\n사용법: node viewer.mjs [--port <번호>] [--no-open] [--export <폴더>]`);
  process.exit(2);
}

function parseArgs(argv: readonly string[]): Options {
  const options: Options = { port: DEFAULT_PORT, open: true, exportDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-open") options.open = false;
    else if (arg === "--port") {
      const port = Number(argv[i + 1]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) usage("--port에는 1024~65535 사이 숫자를 주세요.");
      options.port = port;
      i += 1;
    } else if (arg === "--export") {
      const dir = argv[i + 1];
      if (dir === undefined || dir.startsWith("--")) usage("--export에는 기록을 써 넣을 폴더를 주세요.");
      options.exportDir = dir;
      i += 1;
    } else usage(`알 수 없는 옵션: ${arg ?? ""}`);
  }
  return options;
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {
    console.log("브라우저를 열지 못했어요. 위 주소를 직접 여세요.");
  });
  child.unref();
}

const options = parseArgs(process.argv.slice(2));
const paths = resolvePaths();
const store = new SessionStore(paths, REPO_ROOT);

if (options.exportDir !== null) {
  const file = exportSessions(store, REPO_ROOT, options.exportDir);
  console.log(`세션 기록 ${store.list().length}개를 내보냈어요: ${file}`);
} else {
  let server;
  try {
    server = await startViewerServer({ store, repoRoot: REPO_ROOT, port: options.port });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EADDRINUSE") {
      console.error(`포트 ${options.port}을 이미 쓰고 있어요. 뷰어가 이미 떠 있는지 보거나 --port로 다른 번호를 주세요.`);
      process.exit(1);
    }
    throw error;
  }
  console.log(`세션 뷰어: ${server.url}`);
  console.log(`읽는 곳: ${paths.projectDir}`);
  console.log("끝내려면 Ctrl+C");
  if (options.open) openBrowser(server.url);
  const shutdown = (): void => {
    void server.close().then(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
