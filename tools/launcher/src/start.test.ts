import { spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { REPO_ROOT } from "./paths.ts";
import { createFixture, originalClaudeState, type Fixture } from "./test-fixture.ts";

let fixture: Fixture | null = null;
afterEach(() => {
  fixture?.cleanup();
  fixture = null;
});

function launchEntries(f: Fixture) {
  return f.claudeLog().filter((entry) => entry.args !== undefined && entry.args[0] !== "--version");
}

describe("node start.mjs", () => {
  it("Node 24가 아니면 첫 단계에서 설치 안내(Windows zip 포함)와 함께 0이 아닌 코드로 멈춘다", () => {
    fixture = createFixture();
    const fakeNode = path.join(fixture.root, "node-20.mjs");
    writeFileSync(
      fakeNode,
      'Object.defineProperty(process.versions, "node", { value: "20.11.0" });\nObject.defineProperty(process, "version", { value: "v20.11.0" });\n',
    );
    const result = fixture.run("start.mjs", ["--check"], { nodeArgs: ["--import", pathToFileURL(fakeNode).href] });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[1/7] Node 24 확인: 실패");
    expect(result.stderr).toContain("v20.11.0");
    expect(result.stderr).toContain("https://nodejs.org/ko/download");
    expect(result.stderr).toContain("Windows 바이너리 .zip");
    expect(result.stderr).toContain('start.mjs가 "Node 24 확인" 단계에서 멈췄습니다');
    expect(result.stdout + result.stderr).not.toContain("[2/7]");
    expect(fixture.claudeLog()).toEqual([]);
  });

  it("claude 명령이 없으면 그 단계에서 설치 링크와 함께 0이 아닌 코드로 멈춘다", () => {
    fixture = createFixture({ claude: false });
    const result = fixture.run("start.mjs");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[3/7] claude 명령 확인: 실패");
    expect(result.stderr).toContain("https://code.claude.com/docs/ko/setup");
    expect(result.stderr).toContain('start.mjs가 "claude 명령 확인" 단계에서 멈췄습니다');
    expect(result.stdout + result.stderr).not.toContain("[4/7]");
    expect(existsSync(fixture.practiceDir)).toBe(false);
  });

  it("관찰 Hook 설정이 없으면 claude를 띄우지 않고 5단계에서 멈춘다", () => {
    fixture = createFixture({ hook: false });
    const result = fixture.run("start.mjs");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[6/7] 실습 설정 폴더·.env·관찰 Hook: 실패");
    expect(result.stderr).toContain(path.join("tools", "observer", "hooks", "settings.json"));
    expect(launchEntries(fixture)).toEqual([]);
  });

  it("--check는 실행 전 단계를 준비하고 claude를 띄우지 않으며 원래 ~/.claude는 그대로다", () => {
    fixture = createFixture();
    const before = originalClaudeState(fixture);
    const result = fixture.run("start.mjs", ["--check"]);

    expect(result.status, result.stderr).toBe(0);
    for (const step of ["[1/7] Node 24 확인", "[2/7] 실습 설정 폴더 위치", "[3/7] claude 명령 확인", "[4/7] 의존성", "[5/7] DB", "[6/7] 실습 설정 폴더·.env·관찰 Hook"]) {
      expect(result.stdout).toContain(step);
    }
    expect(result.stdout).not.toContain("[7/7]");
    // claude를 부르는 모든 곳(--version 포함)이 실습 설정 폴더를 쓴다.
    expect(fixture.claudeLog()).toEqual([{ args: ["--version"], configDir: fixture.practiceDir, cwd: fixture.repo }]);
    expect(fixture.npmLog()).toEqual([]);
    expect(existsSync(fixture.practiceDir)).toBe(true);
    expect(readFileSync(path.join(fixture.repo, ".env"), "utf8")).toBe(readFileSync(path.join(fixture.repo, ".env.example"), "utf8"));
    expect(originalClaudeState(fixture)).toEqual(before);
  });

  describe("의존성 단계는 파일 시각이 아니라 lock 내용으로 설치 여부를 판정한다", () => {
    it("내용은 같고 시각만 바뀐 경우(압축 해제·checkout·touch)에는 npm ci를 부르지 않는다", () => {
      fixture = createFixture();
      const day = 24 * 3600;
      const now = Date.now() / 1000;
      // 압축 해제처럼 package-lock.json이 설치 기록보다 훨씬 새로워진 상태
      utimesSync(path.join(fixture.repo, "package-lock.json"), now + day, now + day);
      utimesSync(fixture.hiddenLockFile, now - 30 * day, now - 30 * day);
      const result = fixture.run("start.mjs", ["--check"]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("[4/7] 의존성: 통과 (이미 설치됨)");
      expect(fixture.npmLog()).toEqual([]);
    });

    it("이 컴퓨터에 설치되지 않는 optional 바이너리가 숨은 lock에 없어도 설치된 것으로 본다", () => {
      fixture = createFixture();
      const lock = fixture.readLock();
      const skipped = Object.entries(lock.packages).filter(([, entry]) => entry.optional === true && Array.isArray(entry.os) && !entry.os.includes(process.platform));
      expect(skipped.length).toBeGreaterThan(0);
      const installed = fixture.readHiddenLock().packages;
      expect(skipped.every(([location]) => !(location in installed))).toBe(true);
      const result = fixture.run("start.mjs", ["--check"]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("[4/7] 의존성: 통과 (이미 설치됨)");
      expect(fixture.npmLog()).toEqual([]);
    });

    it("설치된 패키지 버전이 package-lock.json과 다르면 npm ci를 부르고 이유를 보인다", () => {
      fixture = createFixture();
      const [location] = Object.entries(fixture.readLock().packages).find(([name, entry]) => name !== "" && entry.optional !== true && entry.resolved !== undefined) ?? [];
      if (location === undefined) throw new Error("테스트에 쓸 패키지가 package-lock.json에 없습니다.");
      fixture.editHiddenLock((packages) => {
        packages[location] = { ...packages[location], version: "0.0.1" };
      });
      const result = fixture.run("start.mjs", ["--check"]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`${location}의 버전이`);
      expect(result.stdout).toContain("설치된 것: 0.0.1");
      expect(result.stdout).toContain("[4/7] 의존성: 새로 설치함 (npm ci)");
      expect(fixture.npmLog()).toEqual([{ args: ["ci"], cwd: fixture.repo }]);
    });

    it("이 컴퓨터용 optional 바이너리가 빠진 node_modules(다른 OS·CPU용 압축 파일)는 npm ci를 부른다", () => {
      fixture = createFixture();
      const here = Object.entries(fixture.readHiddenLock().packages).find(
        ([, entry]) => entry.optional === true && Array.isArray(entry.os) && Array.isArray(entry.cpu) && entry.os.includes(process.platform) && entry.cpu.includes(process.arch),
      );
      if (here === undefined) throw new Error("이 컴퓨터용 optional 바이너리가 package-lock.json에 없습니다.");
      const missing = here[0];
      fixture.replaceHiddenLockPackages((packages) => Object.fromEntries(Object.entries(packages).filter(([name]) => name !== missing)));
      const result = fixture.run("start.mjs", ["--check"]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(here[0]);
      expect(result.stdout).toContain("[4/7] 의존성: 새로 설치함 (npm ci)");
      expect(fixture.npmLog()).toEqual([{ args: ["ci"], cwd: fixture.repo }]);
    });

    it("패키지 폴더가 빠진 node_modules(압축 해제가 건너뜀)는 이유와 함께 npm ci를 부른다", () => {
      fixture = createFixture();
      const location = Object.keys(fixture.readHiddenLock().packages).find((name) => name.startsWith("node_modules/") && !name.startsWith("node_modules/zod"));
      if (location === undefined) throw new Error("테스트에 쓸 패키지가 없습니다.");
      rmSync(path.join(fixture.repo, location), { recursive: true, force: true });
      const result = fixture.run("start.mjs", ["--check"]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain(`${location}/package.json이 없습니다`);
      expect(fixture.npmLog()).toEqual([{ args: ["ci"], cwd: fixture.repo }]);
    });

    it("숨은 lock이 없으면 npm ci를 부른다", () => {
      fixture = createFixture();
      rmSync(fixture.hiddenLockFile);
      const result = fixture.run("start.mjs", ["--check"]);

      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("node_modules/.package-lock.json이 없습니다");
      expect(result.stdout).toContain("[4/7] 의존성: 새로 설치함 (npm ci)");
      expect(fixture.npmLog()).toEqual([{ args: ["ci"], cwd: fixture.repo }]);
    });

    it("고정물에서 npm ci가 돌아도 레포의 진짜 node_modules는 그대로다", () => {
      fixture = createFixture();
      const real = path.join(REPO_ROOT, "node_modules");
      const snapshot = () => ({ entries: readdirSync(real).sort(), hidden: readFileSync(path.join(real, ".package-lock.json"), "utf8") });
      const before = snapshot();
      const fixtureModules = path.join(fixture.repo, "node_modules");
      rmSync(fixture.hiddenLockFile);
      const result = fixture.run("start.mjs", ["--check"]);

      expect(result.status, result.stderr).toBe(0);
      expect(fixture.npmLog()).toEqual([{ args: ["ci"], cwd: fixture.repo }]);
      expect(snapshot()).toEqual(before);
      const links = readdirSync(fixtureModules).filter((name) => lstatSync(path.join(fixtureModules, name)).isSymbolicLink());
      expect(links).toEqual([]);
    });

    it("npm ci가 실패하면 압축 파일 안내와 함께 그 단계에서 멈춘다", () => {
      fixture = createFixture();
      rmSync(fixture.hiddenLockFile);
      fixture.env.FAKE_NPM_EXIT = "1";
      const result = fixture.run("start.mjs", ["--check"]);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("[4/7] 의존성: 실패");
      expect(result.stderr).toContain("https://github.com/yansfil/shop-harness-workshop/releases");
      expect(result.stdout + result.stderr).not.toContain("[5/7]");
    });
  });

  it("실습 설정 폴더와 관찰 Hook으로 claude를 띄우고 claude의 종료 코드로 끝나며 원래 ~/.claude는 그대로다", () => {
    fixture = createFixture();
    const before = originalClaudeState(fixture);
    fixture.env.FAKE_CLAUDE_EXIT = "7";
    const result = fixture.run("start.mjs", ["--continue"]);

    expect(result.status, result.stderr).toBe(7);
    const [launch, ...rest] = launchEntries(fixture);
    expect(rest).toEqual([]);
    expect(launch?.configDir).toBe(fixture.practiceDir);
    expect(launch?.args).toEqual(["--settings", path.join(fixture.repo, "tools", "observer", "hooks", "settings.json"), "--continue"]);
    expect(existsSync(path.join(fixture.practiceDir, ".credentials.json"))).toBe(true);
    expect(originalClaudeState(fixture)).toEqual(before);
  });

  it("실습 설정 폴더가 원래 ~/.claude로 연결돼 있으면 아무 부작용 없이 위치 확인 단계에서 거부한다", () => {
    fixture = createFixture();
    symlinkSync(fixture.originalClaudeDir, fixture.practiceDir, "junction");
    const before = originalClaudeState(fixture);
    const result = fixture.run("start.mjs");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[2/7] 실습 설정 폴더 위치: 실패");
    expect(result.stderr).toContain("원래 설정");
    expect(fixture.claudeLog()).toEqual([]);
    expect(existsSync(path.join(fixture.repo, ".env"))).toBe(false);
    expect(originalClaudeState(fixture)).toEqual(before);
  });

  it("원래 ~/.claude 안의 '..linked' 같은 이름의 폴더로 연결돼 있어도 위치 확인 단계에서 거부한다", () => {
    fixture = createFixture();
    const inside = path.join(fixture.originalClaudeDir, "..linked");
    mkdirSync(inside);
    symlinkSync(inside, fixture.practiceDir, "junction");
    const before = originalClaudeState(fixture);
    const result = fixture.run("start.mjs");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[2/7] 실습 설정 폴더 위치: 실패");
    expect(fixture.claudeLog()).toEqual([]);
    expect(existsSync(path.join(fixture.repo, ".env"))).toBe(false);
    expect(originalClaudeState(fixture)).toEqual(before);
  });

  const badHomes = process.platform === "win32" ? ["relative-home"] : ["relative-home", ""];
  it.each(badHomes)("홈 폴더 값이 %j처럼 절대 경로가 아니면 위치 확인 단계에서 거부하고 레포에 아무것도 만들지 않는다", (home) => {
    fixture = createFixture();
    fixture.env.HOME = home;
    fixture.env.USERPROFILE = home;
    const before = readdirSync(fixture.repo).sort();
    const result = fixture.run("start.mjs");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[2/7] 실습 설정 폴더 위치: 실패");
    expect(fixture.claudeLog()).toEqual([]);
    expect(readdirSync(fixture.repo).sort()).toEqual(before);
  });

  it.skipIf(process.platform === "win32")("Ctrl+C에 start.mjs가 claude보다 먼저 죽지 않고 claude의 종료 코드로 끝난다", async () => {
    fixture = createFixture();
    const f = fixture;
    f.env.FAKE_CLAUDE_WAIT_FOR_INTERRUPT = "1";
    // 터미널의 Ctrl+C처럼 부모와 claude가 든 프로세스 그룹 전체에 SIGINT를 보낸다.
    const parent = spawn(process.execPath, [path.join(f.repo, "start.mjs")], { cwd: f.repo, env: f.env, detached: true, stdio: "ignore" });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      parent.on("exit", (code, signal) => {
        resolve({ code, signal });
      });
    });
    const deadline = Date.now() + 20_000;
    while (!f.claudeLog().some((entry) => entry.ready === true)) {
      if (Date.now() > deadline) throw new Error("가짜 claude가 준비되지 않았습니다.");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (parent.pid === undefined) throw new Error("start.mjs를 시작하지 못했습니다.");
    process.kill(-parent.pid, "SIGINT");

    expect(await exited).toEqual({ code: 42, signal: null });
  }, 30_000);
});
