import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findHere } from "./command.ts";
import { createFixture, hashTree, originalClaudeState, type Fixture } from "./test-fixture.ts";

let fixture: Fixture | null = null;
afterEach(() => {
  fixture?.cleanup();
  fixture = null;
});

function git(f: Fixture, args: string[]): void {
  const result = spawnSync(findHere("git") ?? "git", args, { cwd: f.repo, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 실패: ${result.stderr}`);
}

/** 실습을 한 뒤의 상태: 세션 기록 2개가 든 실습 설정 폴더와 실습 worktree. */
function practiced(options: { dirtyWorktree?: boolean } = {}): { f: Fixture; clean: string; dirty: string } {
  const f = createFixture({ git: true });
  const sessions = path.join(f.practiceDir, "projects", "repo");
  mkdirSync(sessions, { recursive: true });
  writeFileSync(path.join(sessions, "a.jsonl"), "{}\n");
  writeFileSync(path.join(sessions, "b.jsonl"), "{}\n");
  writeFileSync(path.join(f.practiceDir, ".credentials.json"), "{}");
  const clean = path.join(f.root, "wt-clean");
  const dirty = path.join(f.root, "wt-dirty");
  git(f, ["worktree", "add", "-q", clean, "-b", "practice-clean"]);
  if (options.dirtyWorktree === true) {
    git(f, ["worktree", "add", "-q", dirty, "-b", "practice-dirty"]);
    writeFileSync(path.join(dirty, "work-in-progress.txt"), "not committed\n");
  }
  fixture = f;
  return { f, clean, dirty };
}

describe("node cleanup.mjs", () => {
  it("지울 것을 먼저 보이고, N이면 아무것도 지우지 않는다", () => {
    const { f, clean } = practiced();
    const originalBefore = originalClaudeState(f);
    const practiceBefore = hashTree(f.practiceDir);
    const result = f.run("cleanup.mjs", [], { input: "\n\n" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(`실습 설정 폴더: ${f.practiceDir} (세션 기록 2개)`);
    expect(result.stdout).toContain(`실습 worktree: ${clean}`);
    expect(result.stdout).toContain("아무것도 지우지 않았습니다");
    expect(hashTree(f.practiceDir)).toEqual(practiceBefore);
    expect(existsSync(clean)).toBe(true);
    expect(f.claudeLog()).toEqual([]);
    expect(originalClaudeState(f)).toEqual(originalBefore);
  });

  it("y면 실습 설정 폴더 쪽만 로그아웃하고 실습 worktree와 설정 폴더를 지우며, 원래 ~/.claude와 레포는 그대로다", () => {
    const { f, clean } = practiced();
    const originalBefore = originalClaudeState(f);
    const result = f.run("cleanup.mjs", [], { input: "n\ny\n" });

    expect(result.status, result.stderr).toBe(0);
    expect(f.claudeLog()).toEqual([{ args: ["auth", "logout"], configDir: f.practiceDir, cwd: f.repo }]);
    expect(existsSync(f.practiceDir)).toBe(false);
    expect(existsSync(clean)).toBe(false);
    expect(existsSync(path.join(f.repo, "start.mjs"))).toBe(true);
    expect(originalClaudeState(f)).toEqual(originalBefore);
  });

  it("변경이 남은 worktree는 지우지 않고 이름과 이유를 보이며 0이 아닌 코드로 끝난다", () => {
    const { f, clean, dirty } = practiced({ dirtyWorktree: true });
    const result = f.run("cleanup.mjs", [], { input: "n\ny\n" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(dirty);
    expect(existsSync(path.join(dirty, "work-in-progress.txt"))).toBe(true);
    expect(existsSync(clean)).toBe(false);
    expect(existsSync(f.practiceDir)).toBe(false);
  });

  it("실습 설정 폴더가 원래 ~/.claude로 연결돼 있으면 로그아웃·삭제 없이 미리 보기 단계에서 거부한다", () => {
    const { f, clean } = practiced();
    rmSync(f.practiceDir, { recursive: true });
    symlinkSync(f.originalClaudeDir, f.practiceDir, "junction");
    const before = originalClaudeState(f);
    const result = f.run("cleanup.mjs", [], { input: "y\ny\n" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('cleanup.mjs가 "지울 것 미리 보기" 단계에서 멈췄습니다');
    expect(result.stderr).toContain("원래 설정");
    expect(f.claudeLog()).toEqual([]);
    expect(lstatSync(f.practiceDir).isSymbolicLink()).toBe(true);
    expect(existsSync(clean)).toBe(true);
    expect(originalClaudeState(f)).toEqual(before);
  });

  it.each(["원래 설정", "레포"])("실습 설정 폴더가 %s 안의 '..linked' 폴더로 연결돼 있으면 로그아웃·삭제 없이 거부한다", (where) => {
    const { f, clean } = practiced();
    const inside = path.join(where === "레포" ? f.repo : f.originalClaudeDir, "..linked");
    mkdirSync(inside);
    rmSync(f.practiceDir, { recursive: true });
    symlinkSync(inside, f.practiceDir, "junction");
    const before = originalClaudeState(f);
    const result = f.run("cleanup.mjs", [], { input: "n\ny\n" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('cleanup.mjs가 "지울 것 미리 보기" 단계에서 멈췄습니다');
    expect(f.claudeLog()).toEqual([]);
    expect(lstatSync(f.practiceDir).isSymbolicLink()).toBe(true);
    expect(existsSync(clean)).toBe(true);
    expect(originalClaudeState(f)).toEqual(before);
  });

  it("기록 내보내기를 고르면 viewer.mjs --export로 레포 안 exports/에 내보낸다", () => {
    const { f } = practiced();
    writeFileSync(
      path.join(f.repo, "viewer.mjs"),
      [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'const target = process.argv[process.argv.indexOf("--export") + 1];',
        "mkdirSync(target, { recursive: true });",
        'writeFileSync(target + "/index.html", process.env.CLAUDE_CONFIG_DIR);',
      ].join("\n"),
    );
    const result = f.run("cleanup.mjs", [], { input: "y\nn\n" });

    expect(result.status, result.stderr).toBe(0);
    const exported = readdirSync(path.join(f.repo, "exports"));
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatch(/^practice-records-\d{8}-\d{4}$/);
    expect(existsSync(f.practiceDir)).toBe(true);
  });

  it("기록 내보내기가 실패하면 아무것도 지우지 않고 멈춘다", () => {
    const { f, clean } = practiced();
    const result = f.run("cleanup.mjs", [], { input: "y\ny\n" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('cleanup.mjs가 "기록 내보내기" 단계에서 멈췄습니다');
    expect(existsSync(f.practiceDir)).toBe(true);
    expect(existsSync(clean)).toBe(true);
    expect(f.claudeLog()).toEqual([]);
  });
});
