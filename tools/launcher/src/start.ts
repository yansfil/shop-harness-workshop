// node start.mjs [--check] [claude에 넘길 옵션...]
// Node 24 확인(start.mjs가 먼저 함) → 실습 설정 폴더 위치 → claude 명령 → 의존성 → DB → 실습 설정 폴더·.env·관찰 Hook → claude 실행.
// 위치 확인은 부작용이 있는 어떤 단계보다 먼저 한다. --check는 실행 전 단계까지만 한다. 어느 단계도 조용히 건너뛰지 않고, 실패하면 단계 이름·이유·할 일을 보이고 1로 끝난다.
import { copyFileSync, constants as fsConstants, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { capture, findHere, runVisible, spawnInteractive } from "./command.ts";
import { claudeEnv, OBSERVER_SETTINGS_PATH, REPO_ROOT, resolvePracticeConfigDir } from "./paths.ts";
import { runSteps, StepFailure, type Step } from "./report.ts";

const SCRIPT = "start.mjs";
export const TOTAL_STEPS = 7;
const RELEASES_URL = "https://github.com/yansfil/shop-harness-workshop/releases";

export const CLAUDE_INSTALL_HELP = [
  "설치 안내: https://code.claude.com/docs/ko/setup",
  "Mac: 터미널에서 curl -fsSL https://claude.ai/install.sh | bash",
  "Windows: PowerShell에서 irm https://claude.ai/install.ps1 | iex",
  "설치한 뒤 터미널을 새로 열고 claude --version이 되는지 확인하세요.",
];

/** 레포 안이면 레포 기준 경로, 밖이면 전체 경로. */
function relative(file: string): string {
  const inside = path.relative(REPO_ROOT, file);
  return inside === "" || inside.startsWith("..") || path.isAbsolute(inside) ? file : inside;
}

/** PATH에서 claude를 찾고 --version으로 실행되는지 본다. 찾은 경로를 돌려준다. */
function checkClaude(configDir: string): { claude: string; detail: string } {
  const claude = findHere("claude");
  if (claude === null) throw new StepFailure("PATH에서 claude 명령을 찾지 못했습니다.", CLAUDE_INSTALL_HELP);
  const result = capture(claude, ["--version"], { cwd: REPO_ROOT, env: claudeEnv(configDir) });
  if (result.status !== 0) {
    throw new StepFailure(`claude --version이 실패했습니다(종료 코드 ${result.status}). ${result.stderr.trim()}`, CLAUDE_INSTALL_HELP);
  }
  return { claude, detail: `통과 (${result.stdout.trim()}, ${claude})` };
}

function npmPath(): string {
  const npm = findHere("npm");
  if (npm === null) {
    throw new StepFailure("PATH에서 npm 명령을 찾지 못했습니다.", ["npm은 Node와 함께 설치됩니다. Node 24를 다시 설치하거나 PATH를 확인하세요."]);
  }
  return npm;
}

/** node_modules가 지금 package-lock.json대로 설치돼 있는지. npm ci가 남기는 숨은 lock이 package-lock.json보다 새로우면 그렇다. */
function dependenciesInstalled(): boolean {
  const installed = path.join(REPO_ROOT, "node_modules", ".package-lock.json");
  const lock = path.join(REPO_ROOT, "package-lock.json");
  return existsSync(installed) && statSync(installed).mtimeMs >= statSync(lock).mtimeMs;
}

function ensureDependencies(): string {
  if (dependenciesInstalled()) return "통과 (이미 설치됨)";
  console.log("  node_modules가 없거나 package-lock.json보다 오래돼 npm ci를 실행합니다.");
  const code = runVisible(npmPath(), ["ci"], { cwd: REPO_ROOT });
  if (code !== 0) {
    throw new StepFailure(`npm ci가 실패했습니다(종료 코드 ${code}). 위 npm 출력을 확인하세요.`, [
      `회사망에서 npm이 막혔다면 OS별 압축 파일(node_modules 포함)을 받아 쓰세요: ${RELEASES_URL}`,
    ]);
  }
  if (!dependenciesInstalled()) throw new StepFailure("npm ci가 끝났지만 node_modules/.package-lock.json이 없습니다.");
  return "새로 설치함 (npm ci)";
}

/** DB 경로는 API 설정 계약(apps/api/src/config.ts)으로 구한다. 앱처럼 .env 값보다 이미 있는 환경 변수가 앞선다. */
async function databasePath(): Promise<string> {
  const { loadConfig, ConfigError } = await import("../../../apps/api/src/config.ts");
  const envFile = path.join(REPO_ROOT, ".env");
  const fromFile = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  try {
    return loadConfig({ ...fromFile, ...process.env }).databasePath;
  } catch (error) {
    if (error instanceof ConfigError) throw new StepFailure(`${error.message}. .env를 확인하세요.`);
    throw error;
  }
}

async function ensureDatabase(): Promise<string> {
  const file = await databasePath();
  if (existsSync(file)) return `통과 (있음: ${relative(file)})`;
  console.log(`  ${relative(file)} 파일이 없어 npm run db:reset으로 만들고 시드를 채웁니다.`);
  const code = runVisible(npmPath(), ["run", "db:reset"], { cwd: REPO_ROOT });
  if (code !== 0) throw new StepFailure(`npm run db:reset이 실패했습니다(종료 코드 ${code}). 위 출력을 확인하세요.`);
  if (!existsSync(file)) throw new StepFailure(`npm run db:reset이 끝났지만 ${relative(file)} 파일이 없습니다.`);
  return `새로 만듦 (npm run db:reset): ${relative(file)}`;
}

function prepareConfig(configDir: string): string {
  if (!existsSync(OBSERVER_SETTINGS_PATH)) {
    throw new StepFailure(`관찰 Hook 설정이 없습니다: ${relative(OBSERVER_SETTINGS_PATH)}`, [
      "레포 파일이 빠졌습니다. git status로 확인하거나 레포를 다시 받으세요.",
    ]);
  }
  const configExisted = existsSync(configDir);
  mkdirSync(configDir, { recursive: true });

  const envFile = path.join(REPO_ROOT, ".env");
  const envExisted = existsSync(envFile);
  if (!envExisted) copyFileSync(path.join(REPO_ROOT, ".env.example"), envFile, fsConstants.COPYFILE_EXCL);

  return [
    `통과 (실습 설정 폴더 ${configDir} ${configExisted ? "있음" : "새로 만듦"}`,
    `.env ${envExisted ? "있음" : ".env.example에서 복사함"}`,
    `관찰 Hook ${relative(OBSERVER_SETTINGS_PATH)})`,
  ].join(", ");
}

/**
 * claude를 터미널에 그대로 붙여 띄우고 종료 코드를 돌려준다.
 * Ctrl+C는 터미널이 부모와 claude 모두에게 보내므로 부모는 SIGINT를 무시해 claude보다 먼저 죽지 않는다.
 * 터미널이 닫히거나(SIGHUP) 종료 요청(SIGTERM)을 받으면 claude에 넘기고 claude가 끝나기를 기다린다.
 */
function launchClaude(claude: string, configDir: string, claudeArgs: readonly string[]): Promise<number> {
  const args = ["--settings", OBSERVER_SETTINGS_PATH, ...claudeArgs];
  console.log(`[${TOTAL_STEPS}/${TOTAL_STEPS}] claude 실행: CLAUDE_CONFIG_DIR=${configDir} claude ${args.join(" ")}\n`);

  return new Promise((resolve) => {
    const child = spawnInteractive(claude, args, { cwd: REPO_ROOT, env: claudeEnv(configDir) });
    const ignoreInterrupt = (): void => undefined;
    const forward = (signal: NodeJS.Signals): void => {
      child.kill(signal);
    };
    process.on("SIGINT", ignoreInterrupt);
    process.on("SIGTERM", forward);
    process.on("SIGHUP", forward);
    const release = (): void => {
      process.off("SIGINT", ignoreInterrupt);
      process.off("SIGTERM", forward);
      process.off("SIGHUP", forward);
    };
    child.on("error", (error) => {
      release();
      console.error(`\n${SCRIPT}: claude를 시작하지 못했습니다. ${error.message}`);
      resolve(1);
    });
    child.on("exit", (code, signal) => {
      release();
      if (code !== null) resolve(code);
      else resolve(128 + (signal === null ? 0 : os.constants.signals[signal]));
    });
  });
}

/** start.mjs가 Node 24를 확인한 뒤 부른다. 프로세스 종료 코드를 돌려준다. */
export async function runStart(argv: readonly string[]): Promise<number> {
  const checkOnly = argv.includes("--check");
  const claudeArgs = argv.filter((arg) => arg !== "--check");
  let claude = "";
  let configDir = "";
  const steps: Step[] = [
    {
      name: "실습 설정 폴더 위치",
      run: () => {
        configDir = resolvePracticeConfigDir();
        return `통과 (${configDir}, 원래 설정·레포와 겹치지 않음)`;
      },
    },
    {
      name: "claude 명령 확인",
      run: () => {
        const found = checkClaude(configDir);
        claude = found.claude;
        return found.detail;
      },
    },
    { name: "의존성", run: ensureDependencies },
    { name: "DB", run: ensureDatabase },
    { name: "실습 설정 폴더·.env·관찰 Hook", run: () => prepareConfig(configDir) },
  ];
  if (!(await runSteps(SCRIPT, steps, 2, TOTAL_STEPS))) return 1;
  if (checkOnly) {
    console.log(`\n--check 통과: 실행 전 단계가 모두 준비됐습니다. claude는 띄우지 않았습니다. 시작은 node start.mjs`);
    return 0;
  }
  return launchClaude(claude, configDir, claudeArgs);
}
