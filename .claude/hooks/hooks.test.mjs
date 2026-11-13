// Hook 판정 함수의 테스트. 어떤 명령·경로가 막히고 어떤 것이 통과하는지를 표로 확인한다.
import { describe, expect, it } from "vitest";
import { decide as guardBash } from "./guard-bash.mjs";
import { lintTarget } from "./lint-saved-file.mjs";
import { decide as protectFiles } from "./protect-files.mjs";
import { decide as stopVerify, verifyStatus } from "./stop-verify.mjs";

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });
const denied = (output) => output?.hookSpecificOutput?.permissionDecision === "deny";

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
  ])("막는다: %s", (command) => {
    expect(denied(guardBash(bash(command)))).toBe(true);
  });

  it.each([
    "git push origin feature",
    "git push -u origin feature",
    'git commit -m "force push 금지 문서 추가"',
    "git commit -m \"git push -f 설명\"",
    "rm -rf node_modules",
    "rm dist/old.js",
    "rm -f tmp.txt",
    "npm run verify",
  ])("통과시킨다: %s", (command) => {
    expect(guardBash(bash(command))).toBeNull();
  });
});

describe("protect-files", () => {
  const cwd = "/work/shop";
  const committed = (relative) => relative === "packages/db/migrations/0001_init.sql";
  const file = (tool_name, file_path) => ({ tool_name, tool_input: { file_path } });

  it.each([
    [file("Write", "/work/shop/.env")],
    [file("Edit", ".env.local")],
    [file("Edit", "/work/shop/apps/api/.env")],
    [file("Write", "/work/shop/packages/db/migrations/0001_init.sql")],
    [file("Edit", "packages/db/migrations/0001_init.sql")],
    [bash("echo API_PORT=1 >> .env")],
    [bash("sed -i '' s/a/b/ packages/db/migrations/0001_init.sql")],
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
  ])("통과시킨다: %j", (payload) => {
    expect(protectFiles(payload, cwd, committed)).toBeNull();
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
});

describe("stop-verify", () => {
  const use = (id, name, input) => JSON.stringify({ message: { content: [{ type: "tool_use", id, name, input }] } });
  const result = (id, content, is_error = false) => JSON.stringify({ message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error }] } });
  const PASSED = "[verify] 통과: Node 24 확인 → 타입 검사 → lint → 테스트 → 빌드";
  const lines = (...entries) => entries.join("\n");

  it("고친 파일이 없으면 verify 없이 끝내도 된다", () => {
    const text = lines(use("a", "Read", { file_path: "x.ts" }));
    expect(verifyStatus(text).edited).toBe(false);
    expect(stopVerify({ transcript_path: "t" }, () => text)).toBeNull();
  });

  it("코드를 고치고 verify를 돌리지 않았으면 막는다", () => {
    const text = lines(use("a", "Edit", { file_path: "apps/api/src/app.ts" }));
    expect(stopVerify({ transcript_path: "t" }, () => text)).toMatchObject({ decision: "block" });
  });

  it("마지막 수정보다 뒤에 verify가 통과했으면 끝내도 된다", () => {
    const text = lines(use("a", "Edit", { file_path: "a.ts" }), use("b", "Bash", { command: "npm run verify" }), result("b", PASSED));
    expect(stopVerify({ transcript_path: "t" }, () => text)).toBeNull();
  });

  it("verify가 통과한 뒤에 코드를 또 고쳤으면 다시 막는다", () => {
    const text = lines(use("b", "Bash", { command: "npm run verify" }), result("b", PASSED), use("a", "Write", { file_path: "a.ts" }));
    expect(stopVerify({ transcript_path: "t" }, () => text)).toMatchObject({ decision: "block" });
  });

  it("verify가 실패했거나 일부 단계만 돌렸으면 통과로 치지 않는다", () => {
    const failed = lines(use("a", "Edit", { file_path: "a.ts" }), use("b", "Bash", { command: "npm run verify" }), result("b", "[verify] 실패: lint", true));
    const partial = lines(use("a", "Edit", { file_path: "a.ts" }), use("b", "Bash", { command: "npm run lint" }), result("b", "[verify] 통과: lint"));
    expect(verifyStatus(failed).verified).toBe(false);
    expect(verifyStatus(partial).verified).toBe(false);
  });

  it("문서(.md)만 고쳤으면 verify를 요구하지 않는다", () => {
    expect(verifyStatus(lines(use("a", "Write", { file_path: "docs/tasks/x.md" }))).edited).toBe(false);
  });

  it("한 번 막은 뒤에도 그대로면 무한히 막지 않는다", () => {
    const text = lines(use("a", "Edit", { file_path: "a.ts" }));
    const output = stopVerify({ transcript_path: "t", stop_hook_active: true }, () => text);
    expect(output).toHaveProperty("systemMessage");
    expect(output).not.toHaveProperty("decision");
  });

  it("세션 기록을 읽지 못하면 확인된 것으로 치지 않고 막는다", () => {
    const output = stopVerify({ transcript_path: "t" }, () => {
      throw new Error("ENOENT");
    });
    expect(output).toMatchObject({ decision: "block" });
  });
});
