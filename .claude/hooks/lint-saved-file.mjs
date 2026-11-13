// PostToolUse Hook: 저장한 파일 하나의 ESLint 결과를 에이전트에게 돌려준다(자동 수정은 하지 않는다).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { addContext, emit, isMain, readPayload } from "./hook-io.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const LINTED = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs"]);

/** 린트할 파일이면 프로젝트 기준 상대 경로, 아니면 null. */
export function lintTarget(payload, cwd = root) {
  if (!FILE_TOOLS.has(payload.tool_name)) return null;
  const target = String(payload.tool_input?.file_path ?? "");
  if (target === "") return null;
  const absolute = path.resolve(cwd, target);
  const relative = path.relative(cwd, absolute).split(path.sep).join("/");
  if (relative.startsWith("..") || relative.split("/").includes("node_modules")) return null;
  return LINTED.has(path.extname(absolute)) ? relative : null;
}

function eslintBin() {
  const require = createRequire(path.join(root, "package.json"));
  return path.join(path.dirname(require.resolve("eslint/package.json")), "bin", "eslint.js");
}

function run(payload) {
  const relative = lintTarget(payload);
  if (relative === null) return null;
  const result = spawnSync(process.execPath, [eslintBin(), relative, "--max-warnings", "0", "--no-warn-ignored"], {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
  });
  if (result.error) return addContext("PostToolUse", `lint를 실행하지 못했습니다(${relative}): ${result.error.message}. \`npm run lint\`로 확인하세요.`);
  if (result.status === 0) return addContext("PostToolUse", `lint 통과: ${relative}`);
  const detail = `${result.stdout}${result.stderr}`.trim().slice(0, 4000);
  return addContext("PostToolUse", `lint 실패: ${relative} (종료 코드 ${result.status}). 파일은 이미 저장되었습니다. 아래 오류를 고치세요.\n${detail}`);
}

if (isMain(import.meta.url)) emit(run(await readPayload()));
