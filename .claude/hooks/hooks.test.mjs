// Hook 판정 함수의 테스트. 판정 범위는 README.md에 있고, 그 범위를 아래 '막는다'·'통과한다' 표로 고정한다.
// 표의 출처: 리뷰1(3acdb3d 리뷰), 재리뷰1(36b6ef4 재리뷰), 재리뷰2(그 재리뷰의 인접 입력과 고치기 지시).
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
const file = (tool_name, file_path) => ({ tool_name, tool_input: { file_path } });
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
  // 전역 설정의 커밋 서명(commit.gpgsign)이 켜져 있으면 키 에이전트 없이 커밋이 실패하므로 끈다.
  git("config", "commit.gpgsign", "false");
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  return { dir, git, write: (name, text) => writeFileSync(path.join(dir, name), text) };
}

// 가짜 프로젝트: /work/shop, HEAD에 있는 마이그레이션은 0001_init.sql 하나.
const CWD = "/work/shop";
const COMMITTED = ["packages/db/migrations/0001_init.sql"];
const committed = (relative) => COMMITTED.some((entry) => entry === relative || entry.startsWith(`${relative}/`));
const HOOKS = {
  "guard-bash": (payload) => guardBash({ cwd: CWD, ...payload }),
  "protect-files": (payload) => protectFiles(payload, CWD, committed),
};

// [Hook, 입력, 출처]. 출처가 비어 있으면 처음부터 있던 기본 사례.
const BLOCKED = [
  // force push
  ["guard-bash", bash("git push --force origin main"), ""],
  ["guard-bash", bash("git push -f"), "리뷰1"],
  ["guard-bash", bash("git push --force-with-lease"), "리뷰1"],
  ["guard-bash", bash("git push origin main --force-with-lease"), ""],
  ["guard-bash", bash("git -C ../repo push origin +main"), ""],
  ["guard-bash", bash("git status && git push -fu origin feature"), ""],
  ["guard-bash", bash("env git push -f"), "리뷰1"],
  ["guard-bash", bash("command git push -f"), "리뷰1"],
  ["guard-bash", bash("CI=1 git push -f"), "리뷰1"],
  ["guard-bash", bash("sudo git push --force origin main"), "재리뷰1"],
  ["guard-bash", bash("nohup git push -f &"), "재리뷰1"],
  ["guard-bash", bash("timeout 10 git push -f"), "재리뷰1"],
  ["guard-bash", bash("/usr/bin/git push -f"), ""],
  ["guard-bash", bash("git.exe push -f"), ""],
  ["guard-bash", bash('bash -c "git push -f"'), "재리뷰1"],
  ["guard-bash", bash('eval "git push -f"'), "재리뷰1"],
  ["guard-bash", bash("echo $(git push -f)"), "재리뷰1"],
  ["guard-bash", bash("git -C . push -f"), "재리뷰1"],
  // 값을 받는 옵션 뒤의 실제 명령(재리뷰2 F1)
  ["guard-bash", bash("sudo --user root git push -f"), "재리뷰2"],
  ["guard-bash", bash("sudo --user=root git push -f"), "재리뷰2"],
  ["guard-bash", bash("sudo -u deploy git push -f"), "재리뷰2"],
  ["guard-bash", bash("sudo -Eu deploy git push --force"), "재리뷰2"],
  ["guard-bash", bash("sudo --chdir /tmp --user root git push -f"), "재리뷰2"],
  ["guard-bash", bash("git --git-dir .git push -f"), "재리뷰2"],
  ["guard-bash", bash("git --work-tree . push --force"), "재리뷰2"],
  ["guard-bash", bash("git --work-tree=. push --force"), "재리뷰2"],
  ["guard-bash", bash("git -C apps push --force"), "재리뷰2"],
  ["guard-bash", bash("git -c core.pager=cat push -f"), "재리뷰2"],
  ["guard-bash", bash("git -c user.name=x -C . --no-pager push --force origin main"), "재리뷰2"],
  ["guard-bash", bash("env -u HOME git push -f"), "재리뷰2"],
  ["guard-bash", bash("timeout --signal KILL 30 git push -f"), "재리뷰2"],
  // 대량 삭제
  ["guard-bash", bash("rm -rf /"), ""],
  ["guard-bash", bash("rm -rf ."), ""],
  ["guard-bash", bash("rm -rf apps/api"), ""],
  ["guard-bash", bash("rm -rf docs/tasks apps/api"), "리뷰1"],
  ["guard-bash", bash("rm -rf dist docs/tasks"), "리뷰1"],
  ["guard-bash", bash("rm -r *"), ""],
  ["guard-bash", bash("git clean -fd"), ""],
  ["guard-bash", bash("find . -name '*.ts' -delete"), ""],
  ["guard-bash", bash("env rm -rf docs/tasks"), "리뷰1"],
  ["guard-bash", bash("sudo -u root rm -rf apps"), ""],
  ["guard-bash", bash("(cd docs && rm -rf tasks)"), ""],
  ["guard-bash", bash("sh -c 'rm -rf apps/api'"), ""],
  ["guard-bash", bash("ls | xargs rm -rf"), "재리뷰1"],
  ["guard-bash", bash("find docs -exec rm -rf {} \\;"), "재리뷰1"],
  ["guard-bash", bash("sudo --user root rm -rf docs/tasks"), "재리뷰2"],
  ["guard-bash", bash("xargs -n 1 rm -rf < dirs.txt"), "재리뷰2"],
  ["guard-bash", bash("git -C apps clean -fdx"), "재리뷰2"],
  // .env 읽기·쓰기
  ["protect-files", file("Write", "/work/shop/.env"), ""],
  ["protect-files", file("Edit", ".env.local"), ""],
  ["protect-files", file("Edit", "/work/shop/apps/api/.env"), ""],
  ["protect-files", file("Write", "apps\\api\\.env"), ""],
  ["protect-files", file("Read", "/work/shop/apps/api/.env.development"), ""],
  ["protect-files", bash("echo API_PORT=1 >> .env"), ""],
  ["protect-files", bash("echo x > .env"), "리뷰1"],
  ["protect-files", bash("cat .env"), "리뷰1"],
  ["protect-files", bash("cat .e'nv'"), ""],
  ["protect-files", bash("grep KEY apps/api/.env.local"), ""],
  ["protect-files", bash("cat apps/api/.env.development"), "재리뷰1"],
  ["protect-files", bash("node -e \"require('fs').writeFileSync('.env', 'x')\""), "리뷰1"],
  ["protect-files", bash("python3 -c \"open('.env', 'w').write('x')\""), ""],
  ["protect-files", bash("bash -c 'echo x > .env'"), ""],
  ["protect-files", bash("node <<'EOF'\nrequire('fs').writeFileSync('.env','x')\nEOF"), "재리뷰1"],
  ["protect-files", bash("node <<'EOF'\nrequire('fs').appendFileSync('apps/api/.env', 'x')\nEOF"), ""],
  // 이미 커밋된 마이그레이션 수정·삭제·이동
  ["protect-files", file("Write", "/work/shop/packages/db/migrations/0001_init.sql"), ""],
  ["protect-files", file("Edit", "packages/db/migrations/0001_init.sql"), ""],
  ["protect-files", file("Edit", "packages\\db\\migrations\\0001_init.sql"), ""],
  ["protect-files", bash("sed -i s/a/b/ packages/db/migrations/0001_init.sql"), "리뷰1"],
  ["protect-files", bash("sed -i '' s/a/b/ packages/db/migrations/0001_init.sql"), ""],
  ["protect-files", bash("cd packages/db/migrations && sed -i s/a/b/ 0001_init.sql"), "리뷰1"],
  ["protect-files", bash("cd packages/db && echo x >> migrations/0001_init.sql"), ""],
  ["protect-files", bash("cd /work/shop/packages/db/migrations; rm 0001_init.sql"), ""],
  ["protect-files", bash("cd packages/db/migrations\ncat > 0001_init.sql <<'EOF'\nselect 1;\nEOF"), ""],
  ["protect-files", bash("echo x >> packages\\db\\migrations\\0001_init.sql"), "리뷰1"],
  ["protect-files", bash("cp new.sql packages\\db\\migrations\\0001_init.sql"), ""],
  ["protect-files", bash("node -e \"require('fs').writeFileSync('packages/db/migrations/0001_init.sql', 'x')\""), "재리뷰1"],
  ["protect-files", bash('bash -c "cd packages/db/migrations && sed -i s/a/b/ 0001_init.sql"'), "재리뷰1"],
  ["protect-files", bash("tee packages/db/migrations/0001_init.sql < new.sql"), ""],
  ["protect-files", bash("env FOO=1 sed -i s/a/b/ packages/db/migrations/0001_init.sql"), ""],
  ["protect-files", bash("sed -i s/a/b/ packages/db/migrations/*.sql"), "재리뷰1"],
  ["protect-files", bash("mv packages/db/migrations /tmp/old"), ""],
  ["protect-files", bash("cd $SOMEWHERE && echo x >> 0001_init.sql"), ""],
  // 작업 폴더를 바꾸는 옵션·eval 뒤의 상대 경로(재리뷰2 F3)
  ["protect-files", bash("eval 'cd packages/db/migrations'; sed -i '' s/a/b/ 0001_init.sql"), "재리뷰2"],
  ["protect-files", bash('eval "cd packages/db/migrations" && echo x >> 0001_init.sql'), "재리뷰2"],
  ["protect-files", bash("{ cd packages/db/migrations; sed -i s/a/b/ 0001_init.sql; }"), "재리뷰2"],
  ["protect-files", bash("env --chdir packages/db/migrations sed -i s/a/b/ 0001_init.sql"), "재리뷰2"],
  ["protect-files", bash("env -C packages/db/migrations sed -i s/a/b/ 0001_init.sql"), "재리뷰2"],
  // 파일을 쓰는 git 옵션(재리뷰2 F2)
  ["protect-files", bash("git diff --output=packages/db/migrations/0001_init.sql"), "재리뷰2"],
  ["protect-files", bash("git diff --output packages/db/migrations/0001_init.sql HEAD~1"), "재리뷰2"],
  ["protect-files", bash("git log -p --output=packages/db/migrations/0001_init.sql"), "재리뷰2"],
  ["protect-files", bash("git -C packages/db/migrations diff --output=0001_init.sql"), "재리뷰2"],
  ["protect-files", bash("git --no-pager show HEAD --output=packages\\db\\migrations\\0001_init.sql"), "재리뷰2"],
  // find로 폴더 아래 파일을 한꺼번에 고치기
  ["protect-files", bash("find packages/db/migrations -name '*.sql' -exec sed -i '' s/a/b/ {} +"), "재리뷰2"],
  ["protect-files", bash("find . -name '*.sql' -exec sed -i s/a/b/ {} \\;"), "재리뷰2"],
  ["protect-files", bash("cd packages/db && find migrations -delete"), "재리뷰2"],
  // 폴더째 지우기·옮기기, 이름이 같은 파일 덮어쓰기
  ["protect-files", bash("rm -r packages/db"), "재리뷰2"],
  ["protect-files", bash("git rm -r packages/db/migrations"), "재리뷰2"],
  ["protect-files", bash("mv packages/db /tmp/db-old"), "재리뷰2"],
  ["protect-files", bash("cp /tmp/0001_init.sql packages/db/migrations/"), "재리뷰2"],
  ["protect-files", bash("cd packages/db && cp ~/0001_init.sql migrations"), "재리뷰2"],
];

// 두 PreToolUse Hook을 모두 통과해야 하는 정상 입력. 수업에서 흔히 쓰는 명령.
const ALLOWED = [
  // 검증·실행
  bash("npm ci"),
  bash("npm run verify"),
  bash("npm test"),
  bash("npm test -- packages/db"),
  bash("npm run dev"),
  bash("npm run lint"),
  bash("npm run typecheck"),
  bash("npm run build"),
  bash("npm run grade"),
  bash("npm run db:reset"),
  bash("env CI=1 npm test"),
  bash("env FOO=1 npm run verify"),
  bash('bash -c "npm run verify"'),
  bash("node scripts/verify.mjs"),
  bash("node scripts/start.mjs --check"),
  bash('node -e "console.log(process.version)"'),
  bash("npx vitest run"),
  bash("npx vitest run packages/db"),
  bash("npx vitest run apps/api/src/orders"),
  bash("npx tsc --noEmit"),
  bash("npx eslint apps/api/src/app.ts"),
  // git 일상 작업
  bash("git status"),
  bash("git status --short"),
  bash("git diff"),
  bash("git diff --stat day2-a day2-b"),
  bash("git diff -- packages/db/migrations/0001_init.sql"),
  bash("git diff > /tmp/changes.patch"),
  bash("git diff --output=/tmp/changes.patch"),
  bash("git log --oneline -5"),
  bash("git --no-pager log -3"),
  bash("git -c core.pager=cat log -1"),
  bash("git -C ../other status"),
  bash("git show HEAD:packages/db/migrations/0001_init.sql"),
  bash("git add apps/api/src/app.ts"),
  bash("git add -A"),
  bash("git add packages/db/migrations/0002_low_stock.sql"),
  bash('git commit -m "상품 조회 조건 수정"'),
  bash('git commit -m "force push 금지 문서 추가"'),
  bash("git commit -m \"git push -f 설명\""),
  bash('git commit -m "env git push -f 막기"'),
  bash('git commit -m "Keep .env out of commits"'),
  bash('git add -A && git commit -m "안전재고 알림 추가"'),
  bash("git push"),
  bash("git push origin day2-a"),
  bash("git push origin feature"),
  bash("git push -u origin feature"),
  bash("sudo -u deploy git push origin main"),
  bash("git switch -c low-stock"),
  bash("git merge main"),
  bash("git fetch origin"),
  bash("git restore apps/api/src/app.ts"),
  // 파일 만들기·읽기
  bash("mkdir -p apps/api/src/alerts"),
  bash("touch apps/api/src/alerts/low-stock.ts"),
  bash("cat README.md"),
  bash("cat .env.example"),
  bash("head -20 packages/db/migrations/0001_init.sql"),
  bash('rg -n "Money" packages'),
  bash("ls packages/db/migrations"),
  bash("cat packages/db/migrations/0001_init.sql"),
  bash("cd packages/db/migrations && cat 0001_init.sql"),
  bash("cd packages/db/migrations && sed -n 1p 0001_init.sql"),
  bash("sed -n '1,20p' packages/db/migrations/0001_init.sql"),
  bash("cp packages/db/migrations/0001_init.sql /tmp/backup.sql"),
  bash("echo hi > notes.txt"),
  bash('echo "rm -rf apps"'),
  bash('echo "git push -f"'),
  bash("cd docs && echo x > 0001_init.sql"),
  // 소스 고치기
  bash("sed -i '' 's/old/new/' apps/api/src/app.ts"),
  bash("sed -i 's/a/b/' apps/web/src/App.tsx"),
  file("Edit", "apps/api/src/config.ts"),
  file("Write", "/work/shop/.env.example"),
  file("Read", "packages/db/migrations/0001_init.sql"),
  // 새 마이그레이션 만들고 고치기(재리뷰2 F4)
  bash("mkdir -p packages/db/migrations"),
  bash("mkdir packages/db/migrations"),
  bash("mkdir -p packages/db/migrations && cat > packages/db/migrations/9999_review_fixture.sql <<'EOF'\n-- new migration\nEOF"),
  bash("node -e \"require('fs').mkdirSync('packages/db/migrations', {recursive: true})\""),
  bash("touch packages/db/migrations/0002_low_stock.sql"),
  bash("cat > packages/db/migrations/0002_low_stock.sql <<'EOF'\nalter table products add column safety_stock integer;\nEOF"),
  bash("echo x > packages/db/migrations/0002_add_memo.sql"),
  bash("echo '-- memo' >> packages/db/migrations/0002_low_stock.sql"),
  bash("cp /tmp/0002_low_stock.sql packages/db/migrations/"),
  bash("cp /tmp/draft.sql packages/db/migrations/0002_low_stock.sql"),
  bash("cd packages/db/migrations && sed -i '' s/a/b/ 0002_low_stock.sql"),
  file("Write", "packages/db/migrations/0002_add_memo.sql"),
  file("Edit", "packages/db/migrations/0002_low_stock.sql"),
  // 빌드 산출물·파일 하나 지우기
  bash("rm -rf node_modules"),
  bash("rm -rf dist node_modules"),
  bash("rm -rf apps/web/dist"),
  bash("rm dist/old.js"),
  bash("rm apps/api/src/old.ts"),
  bash("rm -f notes.txt"),
  bash("rm packages/db/migrations/0002_low_stock.sql"),
  bash("rm /tmp/scratch.txt"),
  bash("find apps/api -name '*.ts' -exec sed -i '' s/a/b/ {} +"),
  bash("find . -name '*.ts' -exec sed -i s/a/b/ {} \\;"),
  bash("find packages/db/migrations -name '*.sql' -exec cat {} +"),
  bash("find . -name '*.sql' -print"),
  bash("mv /tmp/0002_low_stock.sql packages/db/migrations/"),
  bash("git mv apps/api/src/a.ts apps/api/src/b.ts"),
  bash("git rm apps/api/src/old.ts"),
];

describe("막는다", () => {
  it.each(BLOCKED.map(([hook, payload, source]) => [hook, source || "기본", payload.tool_input.command ?? `${payload.tool_name} ${payload.tool_input.file_path}`, payload]))(
    "%s [%s] %s",
    (hook, _source, _label, payload) => {
      expect(denied(HOOKS[hook](payload))).toBe(true);
    },
  );
});

describe("통과한다(오탐 없음)", () => {
  it.each(ALLOWED.map((payload) => [payload.tool_input.command ?? `${payload.tool_name} ${payload.tool_input.file_path}`, payload]))("%s", (_label, payload) => {
    expect(HOOKS["guard-bash"](payload)).toBeNull();
    expect(HOOKS["protect-files"](payload)).toBeNull();
  });
});

describe("protect-files", () => {
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

    it("HEAD에 있는 번호 파일은 막고, 막은 이유에 그 파일을 적는다", () => {
      expect(denied(protectFiles(file("Edit", "packages/db/migrations/0001_init.sql"), repo.dir))).toBe(true);
      const output = protectFiles(bash("cd packages/db/migrations && sed -i '' 's/a/b/' 0001_init.sql"), repo.dir);
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain("packages/db/migrations/0001_init.sql");
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

  it("재리뷰2: git diff --output으로 소스를 덮어쓴 것도 코드 변경으로 본다", () => {
    expect(stop(lines(use("a", "Bash", { command: "git diff --output=apps/api/src/app.ts" })), T2)).toMatchObject({ decision: "block" });
    expect(stop(lines(use("a", "Bash", { command: "git diff --stat" })), T2)).toBeNull();
  });

  it("폴더만 만들었으면(mkdir) 코드가 바뀌지 않았으므로 verify를 요구하지 않는다", () => {
    expect(stop(lines(use("a", "Bash", { command: "mkdir -p packages/db/migrations" })), T2)).toBeNull();
    expect(stop(lines(use("a", "Bash", { command: "touch apps/api/src/new.ts" })), T2)).toMatchObject({ decision: "block" });
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
