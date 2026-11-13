// 채점기 테스트. 기대값은 docs/rules·docs/architecture.md의 규칙에서 왔다(구현을 보고 정하지 않았다).
// 진짜 git 저장소를 임시 폴더에 만들고 시작 태그를 단 뒤, 수강생이 바꿨을 법한 코드를 넣어 채점한다.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GradeError } from "./git.ts";
import { gradeAll, gradeSinceStart, type GradeResult } from "./grade.ts";

const roots: string[] = [];

function run(root: string, args: string[]): void {
  execFileSync("git", ["-c", "user.name=grader-test", "-c", "user.email=grader@example.test", "-c", "commit.gpgsign=false", "-c", "tag.gpgsign=false", ...args], {
    cwd: root,
    stdio: "ignore",
  });
}

function write(root: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

/** day1-b 브랜치에 start/day1-b 태그를 단 저장소. */
function repoAtStart(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "grader-"));
  roots.push(root);
  run(root, ["init", "--quiet", "--initial-branch=day1-b"]);
  write(root, files);
  run(root, ["add", "-A"]);
  run(root, ["commit", "--quiet", "--no-verify", "-m", "start"]);
  run(root, ["tag", "start/day1-b"]);
  return root;
}

function found(result: GradeResult): string[] {
  return result.violations.map((violation) => `${violation.rule} ${violation.file}:${violation.line}`);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const CONTROLLER = "apps/api/src/orders/web/order-controller.ts";
const SERVICE = "apps/api/src/orders/application/order-service.ts";

describe("규칙 1 계층 import 방향", () => {
  it("web이 infra를 가져오면 위반, application을 가져오면 통과", () => {
    const root = repoAtStart({ [CONTROLLER]: "export {};\n" });
    write(root, {
      [CONTROLLER]: 'import { OrderService } from "../application/order-service.ts";\nimport { OrderRepository } from "../infra/order-repository.ts";\nexport {};\n',
    });
    expect(found(gradeSinceStart(root))).toEqual([`layer-import ${CONTROLLER}:2`]);
  });

  it("domain이 @grabmarket/db를 가져오면 위반", () => {
    const root = repoAtStart({ "README.md": "x\n" });
    write(root, { "apps/api/src/orders/domain/order.ts": 'import { openDatabase } from "@grabmarket/db";\nexport {};\n' });
    expect(found(gradeSinceStart(root))).toEqual(["layer-import apps/api/src/orders/domain/order.ts:1"]);
  });
});

describe("규칙 4 new Date()", () => {
  it("new Date()와 Date.now()는 위반, 값을 넘긴 new Date(...)와 clock.now()는 통과", () => {
    const root = repoAtStart({ [SERVICE]: "export {};\n" });
    write(root, {
      [SERVICE]: ["const a = new Date();", "const b = Date.now();", 'const c = new Date("2026-11-16T00:00:00Z");', "const d = clock.now();", "export { a, b, c, d };", ""].join("\n"),
    });
    expect(found(gradeSinceStart(root))).toEqual([`new-date ${SERVICE}:1`, `new-date ${SERVICE}:2`]);
  });

  it("systemClock이 있는 clock.ts 한 곳은 통과", () => {
    const root = repoAtStart({ "README.md": "x\n" });
    write(root, { "packages/shared/src/clock.ts": "export const systemClock = { now: () => new Date() };\n" });
    expect(found(gradeSinceStart(root))).toEqual([]);
  });
});

describe("규칙 5 요청의 customerId", () => {
  it("요청 본문·쿼리·경로의 customerId·userId를 읽으면 위반, 세션 사용자의 id는 통과", () => {
    const root = repoAtStart({ [CONTROLLER]: "export {};\n" });
    write(root, {
      [CONTROLLER]: [
        "export function a(req: any, res: any) {",
        "  const id = req.body.customerId;",
        "  const { userId } = req.query;",
        '  const other = req.params["customerId"];',
        "  const user = requireCustomer(res);",
        "  return [id, userId, other, user.id];",
        "}",
        "",
      ].join("\n"),
    });
    expect(found(gradeSinceStart(root))).toEqual([`request-customer-id ${CONTROLLER}:2`, `request-customer-id ${CONTROLLER}:3`, `request-customer-id ${CONTROLLER}:4`]);
  });
});

describe("규칙 3 전이 함수 밖 status 대입", () => {
  it("service에서 status를 대입하거나 SQL로 바꾸면 위반", () => {
    const root = repoAtStart({ [SERVICE]: "export {};\n" });
    write(root, {
      [SERVICE]: ['export function ship(order: { status: string }, db: any) {', '  order.status = "shipping";', '  db.prepare("UPDATE orders SET status = ? WHERE id = ?");', "}", ""].join("\n"),
    });
    expect(found(gradeSinceStart(root))).toEqual([`status-assignment ${SERVICE}:2`, `status-assignment ${SERVICE}:3`]);
  });

  it("도메인 전이 함수 안의 대입과 infra repository의 저장 SQL은 통과", () => {
    const root = repoAtStart({ "README.md": "x\n" });
    write(root, {
      "apps/api/src/orders/domain/order-status.ts": "export function apply(order: { status: string }, next: string) {\n  order.status = next;\n}\n",
      "apps/api/src/orders/infra/order-repository.ts": 'export const SAVE = "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?";\n',
    });
    expect(found(gradeSinceStart(root))).toEqual([]);
  });
});

describe("규칙 7 기존 테스트 expect 변경", () => {
  const TEST = "tests/orders.test.ts";
  const ORIGINAL = ['it("total", () => {', "  expect(total).toBe(15900);", "  expect(order).toEqual({", "    status: \"paid\",", "  });", "});", ""].join("\n");

  it("기존 기대값을 바꾸면(여러 줄 expect 안쪽 포함) 위반", () => {
    const root = repoAtStart({ [TEST]: ORIGINAL });
    write(root, { [TEST]: ORIGINAL.replace("15900", "12900").replace('"paid"', '"shipping"') });
    expect(found(gradeSinceStart(root))).toEqual([`test-expect-change ${TEST}:2`, `test-expect-change ${TEST}:4`]);
  });

  it("기존 expect는 그대로 두고 새 테스트를 더하면 통과", () => {
    const root = repoAtStart({ [TEST]: ORIGINAL });
    write(root, { [TEST]: `${ORIGINAL}it("new", () => {\n  expect(1).toBe(1);\n});\n` });
    expect(found(gradeSinceStart(root))).toEqual([]);
  });

  it("기존 테스트 파일을 지우면 위반", () => {
    const root = repoAtStart({ [TEST]: ORIGINAL });
    rmSync(path.join(root, TEST));
    expect(found(gradeSinceStart(root))).toEqual([`test-expect-change ${TEST}:1`]);
  });
});

describe("규칙 8 기존 마이그레이션 수정", () => {
  const INIT = "packages/db/migrations/0001_init.sql";

  it("적용된 마이그레이션을 고치면 위반", () => {
    const root = repoAtStart({ [INIT]: "CREATE TABLE orders (\n  id INTEGER PRIMARY KEY\n);\n" });
    write(root, { [INIT]: "CREATE TABLE orders (\n  id INTEGER PRIMARY KEY,\n  memo TEXT\n);\n" });
    expect(found(gradeSinceStart(root))).toEqual([`migration-change ${INIT}:2`]);
  });

  it("새 번호 마이그레이션을 더하면 통과", () => {
    const root = repoAtStart({ [INIT]: "CREATE TABLE orders (id INTEGER PRIMARY KEY);\n" });
    write(root, { "packages/db/migrations/0002_add_order_memo.sql": "ALTER TABLE orders ADD COLUMN memo TEXT;\n" });
    expect(found(gradeSinceStart(root))).toEqual([]);
  });
});

describe("채점 범위", () => {
  const LEGACY = { [SERVICE]: "export const createdAt = new Date();\n" };

  it("기본 범위는 시작 태그 이후 바뀐 줄만 본다(태그 전부터 있던 위반은 세지 않는다)", () => {
    const root = repoAtStart(LEGACY);
    write(root, { [SERVICE]: "export const createdAt = new Date();\nexport const ok = 1;\n" });
    const result = gradeSinceStart(root);
    expect(result.violations).toEqual([]);
    expect(result.filesChecked).toBe(1);
  });

  it("커밋한 변경도 시작 태그 이후면 센다", () => {
    const root = repoAtStart({ "README.md": "x\n" });
    write(root, LEGACY);
    run(root, ["add", "-A"]);
    run(root, ["commit", "--quiet", "--no-verify", "-m", "work"]);
    expect(found(gradeSinceStart(root))).toEqual([`new-date ${SERVICE}:1`]);
  });

  it("--all은 레포 전체 위반을 세고 diff로만 알 수 있는 규칙은 해당 없음으로 둔다", () => {
    const root = repoAtStart({ ...LEGACY, [CONTROLLER]: 'import { R } from "../infra/order-repository.ts";\nexport { R };\n' });
    const result = gradeAll(root);
    expect(found(result)).toEqual([`layer-import ${CONTROLLER}:1`, `new-date ${SERVICE}:1`]);
    expect(result.rules.map((rule) => rule.count)).toEqual([1, 1, 0, 0, null, null]);
  });

  it("시작 태그가 없으면 그 사실을 말하고 실패한다", () => {
    const root = repoAtStart({ "README.md": "x\n" });
    run(root, ["checkout", "--quiet", "-b", "my-work"]);
    expect(() => gradeSinceStart(root)).toThrow(GradeError);
    expect(() => gradeSinceStart(root)).toThrow("start/my-work");
  });

  it("같은 코드는 몇 번을 채점해도 같은 결과다", () => {
    const root = repoAtStart(LEGACY);
    write(root, { [CONTROLLER]: 'import { R } from "../infra/r.ts";\nconst id = req.body.customerId;\nexport { R, id };\n', [SERVICE]: "order.status = 1;\nconst t = Date.now();\n" });
    const first = JSON.stringify(gradeSinceStart(root));
    expect(JSON.stringify(gradeSinceStart(root))).toBe(first);
    expect(JSON.stringify(gradeSinceStart(root))).toBe(first);
  });
});
