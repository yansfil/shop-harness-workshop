// node cleanup.mjs: 강의가 끝난 뒤 실습 흔적을 정리한다.
// 지울 것 미리 보기 → 기록 HTML 내보내기(선택) → y/N → 실습 설정 폴더 쪽만 로그아웃 → 실습 worktree·설정 폴더 삭제.
// y를 받기 전에는 아무것도 지우지 않는다. 원래 ~/.claude와 레포 본 checkout은 건드리지 않는다.
import { existsSync, readdirSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { capture, findHere, runVisible } from "./command.ts";
import { practiceConfigDir, REPO_ROOT } from "./paths.ts";
import { runSteps, StepFailure } from "./report.ts";

const SCRIPT = "cleanup.mjs";
const TOTAL_STEPS = 6;

/** 실습 설정 폴더의 세션 기록 수. 세션 하나가 projects/<프로젝트>/<세션 id>.jsonl 파일 하나다. */
export function countSessions(configDir: string): number {
  const projects = path.join(configDir, "projects");
  if (!existsSync(projects)) return 0;
  let count = 0;
  for (const project of readdirSync(projects, { withFileTypes: true })) {
    if (!project.isDirectory()) continue;
    count += readdirSync(path.join(projects, project.name)).filter((name) => name.endsWith(".jsonl")).length;
  }
  return count;
}

/** git worktree list --porcelain 출력에서 본 checkout(첫 항목)을 뺀 실습 worktree 경로들. */
export function parseLinkedWorktrees(porcelain: string): string[] {
  const paths = porcelain
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
  return paths.slice(1);
}

function samePath(a: string, b: string): boolean {
  const real = (p: string): string => (existsSync(p) ? realpathSync.native(p) : path.resolve(p));
  const left = real(a);
  const right = real(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function gitPath(): string {
  const git = findHere("git");
  if (git === null) throw new StepFailure("PATH에서 git 명령을 찾지 못했습니다.", ["https://git-scm.com/downloads 에서 git을 설치하세요."]);
  return git;
}

function practiceWorktrees(): string[] {
  const result = capture(gitPath(), ["worktree", "list", "--porcelain"], { cwd: REPO_ROOT });
  if (result.status !== 0) throw new StepFailure(`git worktree list가 실패했습니다(종료 코드 ${result.status}). ${result.stderr.trim()}`);
  return parseLinkedWorktrees(result.stdout).filter((worktree) => existsSync(worktree) && !samePath(worktree, REPO_ROOT));
}

function claudePath(): string {
  const claude = findHere("claude");
  if (claude === null) {
    throw new StepFailure("PATH에서 claude 명령을 찾지 못해 실습 설정 폴더 쪽 로그아웃을 할 수 없습니다. 아무것도 지우지 않았습니다.", [
      "claude가 PATH에 있는 터미널에서 다시 실행하세요.",
    ]);
  }
  return claude;
}

/** 엔터 한 번이면 아니오. 입력이 끝났으면(파이프·Ctrl+D) 아니오. */
async function askYesNo(lines: AsyncIterator<string>, question: string): Promise<boolean> {
  process.stdout.write(`${question} (y/N) `);
  const next = await lines.next();
  const answer = next.done === true ? "" : next.value.trim().toLowerCase();
  if (next.done === true) process.stdout.write("\n");
  return answer === "y" || answer === "yes";
}

function exportDir(): string {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  return path.join(REPO_ROOT, "exports", `practice-records-${stamp}`);
}

/** cleanup.mjs가 Node 24를 확인한 뒤 부른다. 프로세스 종료 코드를 돌려준다. */
export async function runCleanup(): Promise<number> {
  const configDir = practiceConfigDir();
  const configExists = existsSync(configDir);
  let worktrees: string[] = [];

  const previewed = await runSteps(
    SCRIPT,
    [
      {
        name: "지울 것 미리 보기",
        run: () => {
          worktrees = practiceWorktrees();
          return "아래 목록";
        },
      },
    ],
    2,
    TOTAL_STEPS,
  );
  if (!previewed) return 1;

  console.log(`  실습 설정 폴더: ${configDir} ${configExists ? `(세션 기록 ${countSessions(configDir)}개)` : "(없음)"}`);
  if (worktrees.length === 0) console.log("  실습 worktree: 없음");
  else for (const worktree of worktrees) console.log(`  실습 worktree: ${worktree}`);
  console.log(`  그대로 둠: 원래 설정 ${path.join(os.homedir(), ".claude")}, 레포 ${REPO_ROOT}`);

  if (!configExists && worktrees.length === 0) {
    console.log("\n지울 것이 없습니다.");
    return 0;
  }

  const input = createInterface({ input: process.stdin, terminal: false });
  const lines = input[Symbol.asyncIterator]();
  try {
    if (configExists && (await askYesNo(lines, "\n실습 기록을 HTML로 레포 안에 내보낼까요?"))) {
      const target = exportDir();
      const exported = await runSteps(
        SCRIPT,
        [
          {
            name: "기록 내보내기",
            run: () => {
              const viewer = path.join(REPO_ROOT, "viewer.mjs");
              if (!existsSync(viewer)) throw new StepFailure("viewer.mjs가 없어 기록을 내보낼 수 없습니다. 아무것도 지우지 않았습니다.");
              const code = runVisible(process.execPath, [viewer, "--export", target], {
                cwd: REPO_ROOT,
                env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
              });
              if (code !== 0) throw new StepFailure(`기록 내보내기가 실패했습니다(종료 코드 ${code}). 아무것도 지우지 않았습니다.`);
              return `통과 (${path.relative(REPO_ROOT, target)})`;
            },
          },
        ],
        3,
        TOTAL_STEPS,
      );
      if (!exported) return 1;
    } else {
      console.log(`[3/${TOTAL_STEPS}] 기록 내보내기: 하지 않음`);
    }

    if (!(await askYesNo(lines, "\n위 실습 설정 폴더와 실습 worktree를 지울까요?"))) {
      console.log(`[4/${TOTAL_STEPS}] 지울지 확인: 아니오. 아무것도 지우지 않았습니다.`);
      return 0;
    }
    console.log(`[4/${TOTAL_STEPS}] 지울지 확인: 예`);
  } finally {
    input.close();
  }

  const done = await runSteps(
    SCRIPT,
    [
      {
        name: "실습 설정 폴더 쪽 로그아웃",
        run: () => {
          if (!configExists) return "건너뜀 (실습 설정 폴더가 없음)";
          const code = runVisible(claudePath(), ["auth", "logout"], { cwd: REPO_ROOT, env: { ...process.env, CLAUDE_CONFIG_DIR: configDir } });
          if (code !== 0) throw new StepFailure(`claude auth logout이 실패했습니다(종료 코드 ${code}). 아무것도 지우지 않았습니다.`);
          return `통과 (CLAUDE_CONFIG_DIR=${configDir})`;
        },
      },
      {
        name: "지우기",
        run: () => {
          const removed: string[] = [];
          const kept: string[] = [];
          for (const worktree of worktrees) {
            const result = capture(gitPath(), ["worktree", "remove", worktree], { cwd: REPO_ROOT });
            if (result.status === 0) removed.push(worktree);
            else kept.push(`${worktree}: ${result.stderr.trim()}`);
          }
          if (configExists) {
            rmSync(configDir, { recursive: true });
            removed.push(configDir);
          }
          if (kept.length > 0) {
            throw new StepFailure(`지움: ${removed.join(", ") || "없음"}. 바뀐 내용이 남아 지우지 않은 worktree가 있습니다.`, [
              ...kept,
              "필요한 변경을 옮긴 뒤 git worktree remove --force <경로>로 직접 지우세요.",
            ]);
          }
          return `통과 (지움: ${removed.join(", ")})`;
        },
      },
    ],
    5,
    TOTAL_STEPS,
  );
  return done ? 0 : 1;
}
