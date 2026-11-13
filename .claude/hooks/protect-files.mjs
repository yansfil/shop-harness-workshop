// PreToolUse Hook: .env 수정과, 이미 커밋된 마이그레이션 파일 수정을 실행 전에 막는다.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { denyTool, emit, isMain, readPayload } from "./hook-io.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const FILE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const MIGRATION = /^packages\/db\/migrations\/\d+_[^/]+\.sql$/;
const WRITES = /(>|\btee\b|\bsed\s+-[a-zA-Z]*i|\brm\b|\bmv\b|\bcp\b|\btruncate\b|\bperl\s+-[a-zA-Z]*i|\bdd\b)/;

function isEnvFile(name) {
  return (name === ".env" || name.startsWith(".env.")) && !/\.(example|sample)$/.test(name);
}

/** 이미 커밋된 파일이면 true. git 기록이 없으면 파일이 있는지로 대신한다. */
function isCommitted(relative, cwd) {
  const result = spawnSync("git", ["cat-file", "-e", `HEAD:${relative}`], { cwd, stdio: "ignore" });
  if (result.error || result.status === 128) return existsSync(path.join(cwd, relative));
  return result.status === 0;
}

const ENV_REASON = ".env는 수정할 수 없습니다. 환경 변수의 키 목록은 apps/api/src/config.ts의 ENV_REGISTRY와 .env.example에 있고, 값은 사람이 직접 바꿉니다.";
const migrationReason = (relative) =>
  `이미 있는 마이그레이션(${relative})은 고칠 수 없습니다. 적용된 노트북의 DB와 스키마가 달라집니다. packages/db/migrations/에 다음 번호 파일(예: 0002_이름.sql)을 새로 만드세요.`;

export function decide(payload, cwd = root, committed = isCommitted) {
  const input = payload.tool_input ?? {};
  if (FILE_TOOLS.has(payload.tool_name)) {
    const target = String(input.file_path ?? input.notebook_path ?? "");
    if (target === "") return null;
    const absolute = path.resolve(cwd, target);
    if (isEnvFile(path.basename(absolute))) return denyTool(ENV_REASON);
    const relative = path.relative(cwd, absolute).split(path.sep).join("/");
    if (MIGRATION.test(relative) && committed(relative, cwd)) return denyTool(migrationReason(relative));
    return null;
  }
  if (payload.tool_name === "Bash") {
    const command = String(input.command ?? "");
    if (!WRITES.test(command)) return null;
    const mentionsEnv = [...command.matchAll(/(?:^|[\s"'=/\\])(\.env(?:\.[\w-]+)?)(?=[\s"';|&)]|$)/g)].some((match) => isEnvFile(match[1]));
    if (mentionsEnv) return denyTool(ENV_REASON);
    for (const match of command.matchAll(/packages\/db\/migrations\/(\d+_[\w.-]+\.sql)/g)) {
      const relative = `packages/db/migrations/${match[1]}`;
      if (committed(relative, cwd)) return denyTool(migrationReason(relative));
    }
  }
  return null;
}

if (isMain(import.meta.url)) emit(decide(await readPayload()));
