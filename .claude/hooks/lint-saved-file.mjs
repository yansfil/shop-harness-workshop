// PostToolUse Hook: 저장한 파일 하나의 ESLint 결과를 에이전트에게 돌려준다(자동 수정은 하지 않는다).
// 세션을 오래 붙잡지 않도록 LINT_TIMEOUT_MS를 넘으면 기다리지 않고 건너뛰었다고 알린다.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { toSlash } from "./bash-command.mjs";
import { addContext, emit, isMain, readPayload } from "./hook-io.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const LINTED = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs"]);
// .claude/settings.json의 이 Hook timeout(30초)보다 짧아야 결과를 돌려줄 수 있다.
export const LINT_TIMEOUT_MS = 25_000;

/** 린트할 파일이면 프로젝트 기준 상대 경로, 아니면 null. */
export function lintTarget(payload, cwd = root) {
  if (!FILE_TOOLS.has(payload.tool_name)) return null;
  const target = toSlash(String(payload.tool_input?.file_path ?? ""));
  if (target === "") return null;
  const absolute = path.resolve(cwd, target);
  const relative = toSlash(path.relative(cwd, absolute));
  if (relative.startsWith("..") || relative.split("/").includes("node_modules")) return null;
  return LINTED.has(path.extname(absolute)) ? relative : null;
}

function eslintCommand(relative) {
  const require = createRequire(path.join(root, "package.json"));
  const bin = path.join(path.dirname(require.resolve("eslint/package.json")), "bin", "eslint.js");
  return [process.execPath, bin, relative, "--max-warnings", "0", "--no-warn-ignored"];
}

/** options.command·timeoutMs는 테스트가 느린 lint를 흉내 낼 때만 넘긴다. */
export function lintSavedFile(payload, { command, timeoutMs = LINT_TIMEOUT_MS } = {}) {
  const relative = lintTarget(payload);
  if (relative === null) return null;
  const [program, ...args] = command ?? eslintCommand(relative);
  const result = spawnSync(program, args, { cwd: root, encoding: "utf8", timeout: timeoutMs });
  if (result.error?.code === "ETIMEDOUT") {
    return addContext(
      "PostToolUse",
      `시간 초과로 lint를 건너뛰었습니다(${relative}, ${timeoutMs / 1000}초). 끝내기 전 \`npm run verify\`의 lint 단계에서 확인하세요.`,
    );
  }
  if (result.error) return addContext("PostToolUse", `lint를 실행하지 못했습니다(${relative}): ${result.error.message}. \`npm run lint\`로 확인하세요.`);
  if (result.status === 0) return addContext("PostToolUse", `lint 통과: ${relative}`);
  const detail = `${result.stdout}${result.stderr}`.trim().slice(0, 4000);
  return addContext("PostToolUse", `lint 실패: ${relative} (종료 코드 ${result.status}). 파일은 이미 저장되었습니다. 아래 오류를 고치세요.\n${detail}`);
}

if (isMain(import.meta.url)) emit(lintSavedFile(await readPayload()));
