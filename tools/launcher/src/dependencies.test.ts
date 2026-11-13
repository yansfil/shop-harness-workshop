import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkInstalledDependencies, hasReleaseFile } from "./dependencies.ts";

type Packages = Record<string, Record<string, unknown>>;

const MAC_ARM = { os: "darwin", cpu: "arm64" };
const MAC_INTEL = { os: "darwin", cpu: "x64" };

const base: Packages = {
  "": { name: "demo" },
  "node_modules/react": { version: "19.0.0", resolved: "https://registry.npmjs.org/react/-/react-19.0.0.tgz", integrity: "sha512-aaa" },
  "node_modules/fsevents": { version: "2.3.3", resolved: "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz", integrity: "sha512-fse", optional: true, os: ["darwin"] },
  "node_modules/bind-darwin-arm64": { version: "1.0.0", resolved: "https://registry.npmjs.org/bind-darwin-arm64.tgz", integrity: "sha512-da", optional: true, os: ["darwin"], cpu: ["arm64"] },
  "node_modules/bind-darwin-x64": { version: "1.0.0", resolved: "https://registry.npmjs.org/bind-darwin-x64.tgz", integrity: "sha512-dx", optional: true, os: ["darwin"], cpu: ["x64"] },
  "node_modules/bind-win32-x64": { version: "1.0.0", resolved: "https://registry.npmjs.org/bind-win32-x64.tgz", integrity: "sha512-wx", optional: true, os: ["win32"], cpu: ["x64"] },
  "node_modules/bind-linux-x64-gnu": { version: "1.0.0", resolved: "https://registry.npmjs.org/bind-linux-x64-gnu.tgz", integrity: "sha512-lg", optional: true, os: ["linux"], cpu: ["x64"], libc: ["glibc"] },
  "node_modules/bind-wasm32": { version: "1.0.0", resolved: "https://registry.npmjs.org/bind-wasm32.tgz", integrity: "sha512-w", optional: true, cpu: ["wasm32"] },
  "node_modules/emnapi": { version: "1.0.0", resolved: "https://registry.npmjs.org/emnapi.tgz", integrity: "sha512-e", optional: true },
};

/** 이 OS·CPU에 맞는 optional만 설치한 것처럼 보이는 숨은 lock 내용. */
function installedFor(platform: { os: string; cpu: string }): Packages {
  const keep = new Set(["node_modules/react", "node_modules/fsevents", `node_modules/bind-${platform.os}-${platform.cpu}`]);
  if (platform.os !== "darwin") keep.delete("node_modules/fsevents");
  return Object.fromEntries(Object.entries(base).filter(([location]) => location !== "" && keep.has(location)));
}

let dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});

/** package-lock.json, 숨은 lock, 숨은 lock이 가리키는 패키지 폴더(package.json)를 가진 임시 레포. */
function repoWith(wanted: Packages, installed: Packages | null, options: { without?: string[] } = {}): string {
  const repo = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), "deps-")));
  dirs.push(repo);
  writeFileSync(path.join(repo, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: wanted }));
  mkdirSync(path.join(repo, "node_modules"));
  if (installed !== null) {
    writeFileSync(path.join(repo, "node_modules", ".package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: installed }));
    for (const location of Object.keys(installed)) {
      if (options.without?.includes(location) === true) continue;
      mkdirSync(path.join(repo, location), { recursive: true });
      writeFileSync(path.join(repo, location, "package.json"), "{}");
    }
  }
  return repo;
}

describe("hasReleaseFile", () => {
  it("Release 압축 파일은 Windows x64와 Mac arm64뿐이다(D-35)", () => {
    expect([MAC_ARM, { os: "win32", cpu: "x64" }, MAC_INTEL, { os: "linux", cpu: "x64" }, { os: "win32", cpu: "arm64" }].map(hasReleaseFile)).toEqual([true, true, false, false, false]);
  });
});

describe("checkInstalledDependencies", () => {
  it("이 컴퓨터에 맞는 바이너리가 있고 다른 OS·CPU용·libc용·플랫폼 조건 없는 optional이 빠져 있으면 설치된 것이다", () => {
    const repo = repoWith(base, installedFor(MAC_ARM));
    expect(checkInstalledDependencies(repo, MAC_ARM)).toEqual({ installed: true, reason: "" });
  });

  it("Release에 압축 파일이 없는 컴퓨터(Intel Mac)는 없는 파일을 받으라고 하지 않고 npm ci로 다시 설치한다고 알린다", () => {
    const repo = repoWith(base, installedFor(MAC_ARM));
    const state = checkInstalledDependencies(repo, MAC_INTEL);

    expect(state.installed).toBe(false);
    expect(state.reason).toContain("Mac arm64용");
    expect(state.reason).toContain("Mac x64");
    expect(state.reason).toContain("npm ci");
    expect(state.reason).not.toContain("받으세요");
  });

  it("다른 OS용 압축 파일(Mac에 Windows)도 설치 안 됨이다", () => {
    const repo = repoWith(base, installedFor({ os: "win32", cpu: "x64" }));
    const state = checkInstalledDependencies(repo, MAC_ARM);

    expect(state.installed).toBe(false);
    expect(state.reason).toContain("Windows x64용");
    expect(state.reason).toContain("Mac arm64용");
  });

  it("이 컴퓨터용 바이너리가 빠졌는데 다른 플랫폼 것도 없으면 설치가 불완전하다고 알린다", () => {
    const installed = installedFor(MAC_ARM);
    delete installed["node_modules/bind-darwin-arm64"];
    const state = checkInstalledDependencies(repoWith(base, installed), MAC_ARM);

    expect(state.installed).toBe(false);
    expect(state.reason).toContain("node_modules/bind-darwin-arm64");
  });

  it("libc가 지정된 optional은 판정하지 않고 건너뛴다", () => {
    const linux = { os: "linux", cpu: "x64" };
    const repo = repoWith(base, { "node_modules/react": base["node_modules/react"] ?? {} });
    expect(checkInstalledDependencies(repo, linux)).toEqual({ installed: true, reason: "" });
  });

  it("숨은 lock은 멀쩡한데 패키지 폴더(package.json)가 빠졌으면 설치 안 됨이고 Windows 긴 경로를 알려 준다", () => {
    const repo = repoWith(base, installedFor(MAC_ARM), { without: ["node_modules/react"] });
    const state = checkInstalledDependencies(repo, MAC_ARM);

    expect(state.installed).toBe(false);
    expect(state.reason).toContain("node_modules/react");
    expect(state.reason).toContain("package.json");
    expect(state.reason).toContain("긴 경로");
  });

  it.each([
    ["integrity", { integrity: "sha512-zzz" }, "integrity"],
    ["resolved", { resolved: "https://mirror.example/react-19.0.0.tgz" }, "resolved"],
    ["version", { version: "18.0.0" }, "18.0.0"],
  ])("%s만 다르면 그 항목을 이유로 든다", (_name, change, expected) => {
    const installed = installedFor(MAC_ARM);
    installed["node_modules/react"] = { ...installed["node_modules/react"], ...change };
    const state = checkInstalledDependencies(repoWith(base, installed), MAC_ARM);

    expect(state.installed).toBe(false);
    expect(state.reason).toContain("node_modules/react");
    expect(state.reason).toContain(expected);
  });

  it("숨은 lock에만 있는 패키지는 package-lock.json에 없는 패키지라고 알린다", () => {
    const installed = { ...installedFor(MAC_ARM), "node_modules/stray": { version: "1.0.0" } };
    const state = checkInstalledDependencies(repoWith(base, installed), MAC_ARM);

    expect(state.installed).toBe(false);
    expect(state.reason).toContain("node_modules/stray");
  });
});
