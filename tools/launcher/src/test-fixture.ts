// start.mjs·cleanup.mjs 테스트용 격리 환경: 임시 HOME, 레포의 실행 파일만 복사한 임시 레포, PATH 위의 가짜 claude.
// 바깥 경계(claude 프로그램, HOME)만 가짜로 두고 start.mjs·cleanup.mjs는 실제 프로세스로 돌린다.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { findHere } from "./command.ts";
import { REPO_ROOT } from "./paths.ts";

const REPO_FILES = [
  "start.mjs",
  "cleanup.mjs",
  "tools/launcher",
  ".env.example",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "apps/api/src/config.ts",
];

const FAKE_CLAUDE = `
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const args = process.argv.slice(2);
const log = (entry) => appendFileSync(process.env.FAKE_CLAUDE_LOG, JSON.stringify(entry) + "\\n");
log({ args, configDir: process.env.CLAUDE_CONFIG_DIR ?? null, cwd: process.cwd() });
if (args[0] === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (args[0] === "auth") process.exit(0);
// 로그인한 것처럼 실습 설정 폴더에 파일을 남긴다.
mkdirSync(process.env.CLAUDE_CONFIG_DIR, { recursive: true });
writeFileSync(path.join(process.env.CLAUDE_CONFIG_DIR, ".credentials.json"), "{}");
if (process.env.FAKE_CLAUDE_WAIT_FOR_INTERRUPT === "1") {
  process.on("SIGINT", () => process.exit(42));
  setInterval(() => undefined, 1000);
  log({ ready: true });
} else {
  process.exit(Number(process.env.FAKE_CLAUDE_EXIT ?? "0"));
}
`;

export interface LogEntry {
  args?: string[];
  configDir?: string | null;
  cwd?: string;
  ready?: boolean;
}

export interface Fixture {
  root: string;
  repo: string;
  home: string;
  practiceDir: string;
  originalClaudeDir: string;
  env: NodeJS.ProcessEnv;
  claudeLog: () => LogEntry[];
  run: (script: "start.mjs" | "cleanup.mjs", args?: string[], options?: { input?: string; nodeArgs?: string[] }) => SpawnSyncReturns<string>;
  cleanup: () => void;
}

/** env 사본의 PATH를 바꾼다. Windows에서는 키가 Path일 수 있어 대소문자 상관없이 찾는다. */
function setPath(env: NodeJS.ProcessEnv, value: string): void {
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  env[key] = value;
}

export function createFixture(options: { claude?: boolean; hook?: boolean; git?: boolean } = {}): Fixture {
  // 하위 프로세스의 cwd·git 출력과 비교하므로 실제 경로로 푼다(Mac의 /var → /private/var, Windows 짧은 이름).
  const root = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "launcher-")));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home");
  const bin = path.join(root, "bin");
  mkdirSync(bin, { recursive: true });

  for (const file of REPO_FILES) {
    cpSync(path.join(REPO_ROOT, file), path.join(repo, file), { recursive: true, preserveTimestamps: true });
  }
  symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(repo, "node_modules"), "junction");
  if (options.hook !== false) {
    mkdirSync(path.join(repo, "tools", "observer", "hooks"), { recursive: true });
    writeFileSync(path.join(repo, "tools", "observer", "hooks", "settings.json"), "{}\n");
  }

  // 원래 ~/.claude 자리: 바뀌면 안 되는 파일들
  const originalClaudeDir = path.join(home, ".claude");
  mkdirSync(path.join(originalClaudeDir, "projects", "work"), { recursive: true });
  writeFileSync(path.join(originalClaudeDir, "settings.json"), '{"model":"original"}\n');
  writeFileSync(path.join(originalClaudeDir, "projects", "work", "session.jsonl"), '{"type":"user"}\n');
  writeFileSync(path.join(home, ".claude.json"), '{"oauthAccount":"original"}\n');

  const claudeLogFile = path.join(root, "claude-log.jsonl");
  if (options.claude !== false) {
    writeFileSync(path.join(bin, "fake-claude.mjs"), FAKE_CLAUDE);
    if (process.platform === "win32") {
      writeFileSync(path.join(bin, "claude.cmd"), `@"${process.execPath}" "%~dp0fake-claude.mjs" %*\r\n`);
    } else {
      writeFileSync(path.join(bin, "claude"), `#!/bin/sh\nexec "${process.execPath}" "${path.join(bin, "fake-claude.mjs")}" "$@"\n`);
      chmodSync(path.join(bin, "claude"), 0o755);
    }
  }

  const databaseFile = path.join(root, "grabmarket.sqlite");
  writeFileSync(databaseFile, "");

  const git = findHere("git");
  if (git === null) throw new Error("테스트에 git이 필요합니다.");
  if (options.git === true) {
    const gitArgs = ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false"];
    for (const args of [["init", "-q", "-b", "main"], ["add", "-A"], [...gitArgs, "commit", "-q", "-m", "fixture"]]) {
      const result = spawnSync(git, args, { cwd: repo, encoding: "utf8" });
      if (result.status !== 0) throw new Error(`git ${args.join(" ")} 실패: ${result.stderr}`);
    }
  }

  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, USERPROFILE: home, DATABASE_PATH: databaseFile, FAKE_CLAUDE_LOG: claudeLogFile };
  delete env.CLAUDE_CONFIG_DIR;
  // 진짜 claude가 보이지 않도록 PATH에는 가짜 claude 폴더와 git 폴더만 둔다.
  setPath(env, [bin, path.dirname(git)].join(path.delimiter));

  return {
    root,
    repo,
    home,
    practiceDir: path.join(home, ".claude-autoever"),
    originalClaudeDir,
    env,
    claudeLog: () =>
      existsSync(claudeLogFile)
        ? readFileSync(claudeLogFile, "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as LogEntry)
        : [],
    run: (script, args = [], runOptions = {}) =>
      spawnSync(process.execPath, [...(runOptions.nodeArgs ?? []), path.join(repo, script), ...args], {
        cwd: repo,
        env,
        input: runOptions.input ?? "",
        encoding: "utf8",
        timeout: 60_000,
      }),
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** 폴더 안 파일마다 내용 해시. 원래 ~/.claude 자리가 그대로인지 비교할 때 쓴다. */
export function hashTree(dir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else hashes[path.relative(dir, full)] = createHash("sha256").update(readFileSync(full)).digest("hex");
    }
  };
  walk(dir);
  return hashes;
}

/** 원래 ~/.claude와 ~/.claude.json의 해시. */
export function originalClaudeState(fixture: Fixture): Record<string, string> {
  return {
    ...hashTree(fixture.originalClaudeDir),
    ".claude.json": createHash("sha256").update(readFileSync(path.join(fixture.home, ".claude.json"))).digest("hex"),
  };
}
