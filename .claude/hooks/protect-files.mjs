// PreToolUse Hook: .env를 읽거나 고치는 것과, 이미 커밋된 마이그레이션 파일을 고치는 것을 실행 전에 막는다.
//
// 판정 기준(예측할 수 있게 단순하게):
//   - .env(.env.local 등, .env.example·.env.sample 제외): 파일 도구가 그 경로를 다루거나, Bash 명령에 그 경로가 나타나면 막는다.
//   - 마이그레이션: packages/db/migrations/<번호>_<이름>.sql 중 HEAD에 있는 파일이 쓰기 대상으로 나타나면 막는다.
//     쓰기 대상 = 출력 리다이렉션, 읽기 전용이 아닌 명령의 인자(cp·ln은 마지막 인자), node -e·python -c·heredoc 스크립트 안의 경로.
//     상대 경로는 `cd`를 따라간 작업 폴더 기준이고, 역슬래시(Windows) 경로도 같게 본다.
//   - HEAD에 없는 번호 파일은 새 파일이므로 커밋 전까지 고칠 수 있다.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { mentionedPaths, simpleCommands, toSlash, writeTargets } from "./bash-command.mjs";
import { denyTool, emit, isMain, readPayload } from "./hook-io.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const FILE_TOOLS = new Set(["Read", "Write", "Edit", "MultiEdit", "NotebookEdit"]);
const MIGRATIONS_DIR = "packages/db/migrations";
const MIGRATION_NAME = /^\d+_[^/]+\.sql$/;

function isEnvFile(target) {
  const name = toSlash(target).split("/").pop();
  return (name === ".env" || name.startsWith(".env.")) && !/\.(example|sample)$/.test(name);
}

/** HEAD에 그 경로(파일이나 폴더 안의 파일)가 있으면 true. 없으면 false, git을 못 돌리면 예외. */
function isCommitted(relative, cwd) {
  const result = spawnSync("git", ["ls-tree", "--name-only", "HEAD", "--", relative], { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim());
  return result.stdout.trim() !== "";
}

/**
 * 쓰기 대상 하나가 가리키는 마이그레이션 경로(프로젝트 기준). 아니면 null.
 * 작업 폴더를 모르면(cd $X 뒤) 파일 이름만으로 마이그레이션 폴더의 파일로 본다.
 */
function migrationPath(target, cwd, projectRoot) {
  const slashed = toSlash(target);
  if (slashed === "") return null;
  const name = slashed.split("/").pop();
  if (cwd === null && !path.isAbsolute(slashed)) return MIGRATION_NAME.test(name) ? `${MIGRATIONS_DIR}/${name}` : null;
  const relative = toSlash(path.relative(projectRoot, path.resolve(cwd, slashed)));
  if (relative === MIGRATIONS_DIR) return MIGRATIONS_DIR;
  if (path.posix.dirname(relative) !== MIGRATIONS_DIR) return null;
  if (/[*?[]/.test(name)) return MIGRATIONS_DIR;
  return MIGRATION_NAME.test(name) ? relative : null;
}

const ENV_REASON =
  ".env는 읽거나 고칠 수 없습니다. 환경 변수의 키 목록은 apps/api/src/config.ts의 ENV_REGISTRY와 .env.example에 있고, 값은 사람이 직접 바꿉니다.";
const migrationReason = (relative) =>
  `이미 있는 마이그레이션(${relative === MIGRATIONS_DIR ? `${MIGRATIONS_DIR}의 기존 파일` : relative})은 고칠 수 없습니다. 적용된 노트북의 DB와 스키마가 달라집니다. ${MIGRATIONS_DIR}/에 다음 번호 파일(예: 0002_이름.sql)을 새로 만드세요.`;

function checkMigrations(candidates, projectRoot, committed) {
  for (const relative of new Set(candidates.filter((candidate) => candidate !== null))) {
    let exists;
    try {
      exists = committed(relative, projectRoot);
    } catch (error) {
      return denyTool(`${relative}가 이미 커밋된 마이그레이션인지 git으로 확인하지 못했습니다(${error.message}). git 상태를 확인하고 사람에게 알리세요.`);
    }
    if (exists) return denyTool(migrationReason(relative));
  }
  return null;
}

export function decide(payload, projectRoot = root, committed = isCommitted) {
  const input = payload.tool_input ?? {};
  const cwd = payload.cwd ?? projectRoot;
  if (FILE_TOOLS.has(payload.tool_name)) {
    const target = String(input.file_path ?? input.notebook_path ?? "");
    if (target === "") return null;
    if (isEnvFile(target)) return denyTool(ENV_REASON);
    if (payload.tool_name === "Read") return null;
    return checkMigrations([migrationPath(target, cwd, projectRoot)], projectRoot, committed);
  }
  if (payload.tool_name !== "Bash") return null;
  const commands = simpleCommands(String(input.command ?? ""), cwd);
  if (commands.some((simple) => mentionedPaths(simple).some(isEnvFile))) return denyTool(ENV_REASON);
  const candidates = commands.flatMap((simple) => writeTargets(simple).map((target) => migrationPath(target, simple.cwd, projectRoot)));
  return checkMigrations(candidates, projectRoot, committed);
}

if (isMain(import.meta.url)) emit(decide(await readPayload()));
