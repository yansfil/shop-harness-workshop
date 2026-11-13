// Hook 판정 함수의 테스트. 어떤 명령·경로가 막히고 어떤 것이 통과하는지를 표로 확인한다.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decide as guardBash } from "./guard-bash.mjs";
import * as lintSavedFile from "./lint-saved-file.mjs";
import { decide as protectFiles } from "./protect-files.mjs";
import { decide as stopVerify } from "./stop-verify.mjs";

const { lintTarget } = lintSavedFile;
const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const denied = (output) => output?.hookSpecificOutput?.permissionDecision === "deny";

/** 커밋 하나가 있는 임시 git 저장소. 끝나면 지운다. */
function tempRepo(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "hooks-test-"));
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.trim();
  };
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { dir, git, write: (name, text) => writeFileSync(path.join(dir, name), text) };
}

describe("guard-bash", () => {
  it.each([
    "git push --force origin main",
    "git push -f",
    "git push origin main --force-with-lease",
    "git -C ../repo push origin +main",
    "git status && git push -fu origin feature",
    "rm -rf /",
    "rm -rf .",
    "rm -rf apps/api",
    "rm -r *",
    "git clean -fd",
    "find . -name '*.ts' -delete",
    // R3: 실행 접두어·이어 붙인 명령·서브셸을 펼쳐서 본다.
    "env git push -f",
    "command git push -f",
    "CI=1 git push -f",
    "sudo git push --force origin main",
    "env rm -rf docs/tasks",
    "sudo -u root rm -rf apps",
    "(cd docs && rm -rf tasks)",
    "nohup git push -f &",
    "timeout 30 git push -f",
    "/usr/bin/git push -f",
    "git.exe push -f",
    'bash -c "git push -f"',
    "sh -c 'rm -rf apps/api'",
    'eval "git push -f"',
    "echo $(git push -f)",
    "ls | xargs rm -rf",
    "find . -name '*.ts' -exec rm -rf {} \\;",
  ])("막는다: %s", (command) => {
    expect(denied(guardBash(bash(command)))).toBe(true);
  });

  it.each([
    "git push origin feature",
    "git push -u origin feature",
    'git commit -m "force push 금지 문서 추가"',
    "git commit -m \"git push -f 설명\"",
    'git commit -m "env git push -f 막기"',
    "rm -rf node_modules",
    "rm -rf dist node_modules",
    "rm dist/old.js",
    "rm -f tmp.txt",
    "npm run verify",
    "env FOO=1 npm run verify",
    'echo "rm -rf apps"',
  ])("통과시킨다: %s", (command) => {
    expect(guardBash(bash(command))).toBeNull();
  });
});

describe("protect-files", () => {
  const cwd = "/work/shop";
  const COMMITTED = ["packages/db/migrations/0001_init.sql"];
  const committed = (relative) => COMMITTED.some((file) => file === relative || file.startsWith(`${relative}/`));
  const file = (tool_name, file_path) => ({ tool_name, tool_input: { file_path } });

  it.each([
    [file("Write", "/work/shop/.env")],
    [file("Edit", ".env.local")],
    [file("Edit", "/work/shop/apps/api/.env")],
    [file("Write", "/work/shop/packages/db/migrations/0001_init.sql")],
    [file("Edit", "packages/db/migrations/0001_init.sql")],
    [bash("echo API_PORT=1 >> .env")],
    [bash("sed -i '' s/a/b/ packages/db/migrations/0001_init.sql")],
    // R2: 작업 폴더를 옮긴 뒤의 상대 경로
    [bash("cd packages/db/migrations && sed -i s/a/b/ 0001_init.sql")],
    [bash("cd packages/db && echo x >> migrations/0001_init.sql")],
    [bash("cd /work/shop/packages/db/migrations; rm 0001_init.sql")],
    [bash("cd packages/db/migrations\ncat > 0001_init.sql <<'EOF'\nselect 1;\nEOF")],
    // R2: Windows 경로 구분자
    [bash("echo x >> packages\\db\\migrations\\0001_init.sql")],
    [bash("cp new.sql packages\\db\\migrations\\0001_init.sql")],
    [file("Edit", "packages\\db\\migrations\\0001_init.sql")],
    [file("Write", "apps\\api\\.env")],
    // R2: 인라인 스크립트·셸 안의 쓰기
    [bash("node -e \"require('fs').writeFileSync('.env', 'x')\"")],
    [bash("python3 -c \"open('.env', 'w').write('x')\"")],
    [bash("bash -c 'echo x > .env'")],
    [bash("node <<'EOF'\nrequire('fs').appendFileSync('apps/api/.env', 'x')\nEOF")],
    [bash("tee packages/db/migrations/0001_init.sql < new.sql")],
    [bash("env FOO=1 sed -i s/a/b/ packages/db/migrations/0001_init.sql")],
    [bash("sed -i s/a/b/ packages/db/migrations/*.sql")],
    [bash("mv packages/db/migrations /tmp/old")],
    [bash("cd $SOMEWHERE && echo x >> 0001_init.sql")],
    [file("Read", "/work/shop/apps/api/.env.development")],
    // .env 읽기: permissions의 Read deny는 Bash를 덮지 않으므로 Hook이 막는다.
    [bash("cat .env")],
    [bash("grep KEY apps/api/.env.local")],
  ])("막는다: %j", (payload) => {
    expect(denied(protectFiles(payload, cwd, committed))).toBe(true);
  });

  it.each([
    [file("Write", "/work/shop/.env.example")],
    [file("Write", "packages/db/migrations/0002_add_memo.sql")],
    [file("Edit", "apps/api/src/config.ts")],
    [bash("cat .env.example")],
    [bash("echo hi > notes.txt")],
    [bash("cat packages/db/migrations/0001_init.sql")],
    [bash("cd packages/db/migrations && cat 0001_init.sql")],
    [bash("cd packages/db/migrations && sed -n 1p 0001_init.sql")],
    [bash("cp packages/db/migrations/0001_init.sql /tmp/backup.sql")],
    [bash("echo x > packages/db/migrations/0002_add_memo.sql")],
    [bash("cd docs && echo x > 0001_init.sql")],
    [bash('git commit -m "Keep .env out of commits"')],
  ])("통과시킨다: %j", (payload) => {
    expect(protectFiles(payload, cwd, committed)).toBeNull();
  });

  describe("새 마이그레이션은 HEAD 기준으로 판단한다(R4)", () => {
    let repo;
    beforeAll(() => {
      repo = tempRepo({ "packages/db/migrations/0001_init.sql": "create table a(id int);\n" });
      repo.write("packages/db/migrations/0002_new.sql", "-- new\n");
    });
    afterAll(() => rmSync(repo.dir, { recursive: true, force: true }));

    it("만든 직후 아직 커밋하지 않은 번호 파일은 고칠 수 있다", () => {
      expect(protectFiles(file("Edit", "packages/db/migrations/0002_new.sql"), repo.dir)).toBeNull();
      expect(protectFiles(bash("echo x >> packages/db/migrations/0002_new.sql"), repo.dir)).toBeNull();
    });

    it("HEAD에 있는 번호 파일은 막는다", () => {
      expect(denied(protectFiles(file("Edit", "packages/db/migrations/0001_init.sql"), repo.dir))).toBe(true);
    });
  });
});

describe("lint-saved-file", () => {
  it("프로젝트 안의 소스 파일만 린트 대상이다", () => {
    const edit = (file_path) => ({ tool_name: "Edit", tool_input: { file_path } });
    expect(lintTarget(edit("/work/shop/apps/api/src/app.ts"), "/work/shop")).toBe("apps/api/src/app.ts");
    expect(lintTarget(edit("/work/shop/README.md"), "/work/shop")).toBeNull();
    expect(lintTarget(edit("/elsewhere/a.ts"), "/work/shop")).toBeNull();
    expect(lintTarget(edit("/work/shop/node_modules/x/index.js"), "/work/shop")).toBeNull();
    expect(lintTarget({ tool_name: "Read", tool_input: { file_path: "/work/shop/a.ts" } }, "/work/shop")).toBeNull();
  });

  it("lint가 시간 예산을 넘으면 기다리지 않고 건너뛴다고 알린다(R5)", () => {
    const slow = { command: [process.execPath, "-e", "setTimeout(() => {}, 10000)"], timeoutMs: 300 };
    const started = Date.now();
    const output = lintSavedFile.lintSavedFile({ tool_name: "Edit", tool_input: { file_path: "apps/api/src/app.ts" } }, slow);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(output.hookSpecificOutput.additionalContext).toContain("시간 초과로 lint를 건너뛰었습니다");
  });

  it("세션을 붙잡는 시간 예산은 30초 이하다(R5)", () => {
    expect(lintSavedFile.LINT_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe("stop-verify", () => {
  const use = (id, name, input) => JSON.stringify({ message: { content: [{ type: "tool_use", id, name, input }] } });
  const result = (id, content, is_error = false) => JSON.stringify({ message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error }] } });
  const passed = (tree) => `[verify] 통과: Node 24 확인 → 타입 검사 → lint → 테스트 → 빌드\n[verify] 전체 통과 · 작업 트리 ${tree}`;
  const T1 = "1".repeat(40);
  const T2 = "2".repeat(40);
  const lines = (...entries) => entries.join("\n");
  const stop = (text, tree = T1, extra = {}) => stopVerify({ transcript_path: "t", ...extra }, () => text, () => tree);
  const verifyRun = (id, tree, command = "npm run verify") => [use(id, "Bash", { command }), result(id, passed(tree))];

  it("고친 파일이 없으면 verify 없이 끝내도 된다", () => {
    expect(stop(lines(use("a", "Read", { file_path: "x.ts" })), T2)).toBeNull();
  });

  it("읽기만 한 Bash 명령은 작업 트리가 지저분해도 verify를 요구하지 않는다", () => {
    const text = lines(use("a", "Bash", { command: "git status && cat apps/api/src/app.ts | head -5" }), use("b", "Bash", { command: "rg -n Money packages" }));
    expect(stop(text, T2)).toBeNull();
  });

  it("코드를 고치고 verify를 돌리지 않았으면 막는다", () => {
    expect(stop(lines(use("a", "Edit", { file_path: "apps/api/src/app.ts" })))).toMatchObject({ decision: "block" });
  });

  it("verify가 통과한 작업 트리가 지금과 같으면 끝내도 된다", () => {
    expect(stop(lines(use("a", "Edit", { file_path: "a.ts" }), ...verifyRun("b", T1)), T1)).toBeNull();
  });

  it("verify가 통과한 뒤에 코드를 또 고쳤으면 다시 막는다", () => {
    expect(stop(lines(...verifyRun("b", T1), use("a", "Write", { file_path: "a.ts" })), T2)).toMatchObject({ decision: "block" });
  });

  it("verify 뒤 커밋만 했으면 작업 트리 내용이 같으므로 끝내도 된다", () => {
    const text = lines(use("a", "Edit", { file_path: "a.ts" }), ...verifyRun("b", T1), use("c", "Bash", { command: "git add -A && git commit -m 'x'" }));
    expect(stop(text, T1)).toBeNull();
  });

  it("verify가 실패했거나 일부 단계만 돌렸으면 통과로 치지 않는다", () => {
    const failed = lines(use("a", "Edit", { file_path: "a.ts" }), use("b", "Bash", { command: "npm run verify" }), result("b", "[verify] 실패: lint", true));
    const partial = lines(use("a", "Edit", { file_path: "a.ts" }), use("b", "Bash", { command: "npm run lint" }), result("b", "[verify] 통과: lint"));
    expect(stop(failed)).toMatchObject({ decision: "block" });
    expect(stop(partial)).toMatchObject({ decision: "block" });
  });

  it("R1: verify.mjs --only로 일부 단계만 돈 것은 verify로 치지 않는다", () => {
    const text = lines(
      use("a", "Edit", { file_path: "a.ts" }),
      use("b", "Bash", { command: "node scripts/verify.mjs --only node" }),
      result("b", "[verify 1/1] Node 24 확인\nNode v24.22.1\n\n[verify] 통과: Node 24 확인"),
    );
    expect(stop(text)).toMatchObject({ decision: "block" });
  });

  it("R1: verify 문구를 echo로 찍은 것은 verify로 치지 않는다", () => {
    const text = lines(use("a", "Edit", { file_path: "a.ts" }), ...verifyRun("b", T1, `echo "${passed(T1)}"`));
    expect(stop(text, T1)).toMatchObject({ decision: "block" });
  });

  it("R1: Bash로만 코드를 고치고 verify를 돌리지 않았으면 막는다", () => {
    expect(stop(lines(use("a", "Bash", { command: "sed -i '' s/a/b/ apps/api/src/app.ts" })), T2)).toMatchObject({ decision: "block" });
  });

  it("R1: 전체 verify 뒤 Bash로 코드를 고쳤으면 다시 막는다", () => {
    const text = lines(use("a", "Edit", { file_path: "a.ts" }), ...verifyRun("b", T1), use("c", "Bash", { command: "sed -i '' s/a/b/ apps/api/src/app.ts" }));
    expect(stop(text, T2)).toMatchObject({ decision: "block" });
  });

  it("문서(.md)만 고쳤으면 verify를 요구하지 않는다", () => {
    expect(stop(lines(use("a", "Write", { file_path: "docs/tasks/x.md" })), T2)).toBeNull();
  });

  it("한 번 막은 뒤에도 그대로면 무한히 막지 않고 그 이유를 남긴다", () => {
    const output = stop(lines(use("a", "Edit", { file_path: "a.ts" })), T1, { stop_hook_active: true });
    expect(output).not.toHaveProperty("decision");
    expect(output.systemMessage).toContain("verify");
    expect(output.systemMessage).toContain("반복");
  });

  it("세션 기록을 읽지 못하면 확인된 것으로 치지 않고 막는다", () => {
    const output = stopVerify({ transcript_path: "t" }, () => {
      throw new Error("ENOENT");
    }, () => T1);
    expect(output).toMatchObject({ decision: "block" });
  });

  it("작업 트리 지문을 만들지 못하면 확인된 것으로 치지 않고 막는다", () => {
    const text = lines(use("a", "Edit", { file_path: "a.ts" }), ...verifyRun("b", T1));
    const output = stopVerify({ transcript_path: "t" }, () => text, () => {
      throw new Error("git 없음");
    });
    expect(output).toMatchObject({ decision: "block" });
  });
});

describe("작업 트리 지문", () => {
  let repo;
  let worktreeId;
  beforeAll(async () => {
    ({ worktreeId } = await import("../../scripts/worktree-id.mjs"));
    repo = tempRepo({ "a.ts": "export const a = 1;\n", "README.md": "# x\n" });
  });
  afterAll(() => rmSync(repo.dir, { recursive: true, force: true }));

  it("코드가 바뀌면 달라지고, 커밋해도 내용이 같으면 그대로이며, 문서 변경은 무시한다", () => {
    const clean = worktreeId(repo.dir);
    repo.write("README.md", "# changed\n");
    expect(worktreeId(repo.dir)).toBe(clean);
    repo.write("a.ts", "export const a = 2;\n");
    const edited = worktreeId(repo.dir);
    expect(edited).not.toBe(clean);
    repo.write("b.ts", "export const b = 1;\n");
    const withNew = worktreeId(repo.dir);
    expect(withNew).not.toBe(edited);
    repo.git("add", "-A");
    repo.git("commit", "-q", "-m", "change");
    expect(worktreeId(repo.dir)).toBe(withNew);
    expect(repo.git("status", "--porcelain")).toBe("");
  });
});
