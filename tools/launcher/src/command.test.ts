import { describe, expect, it } from "vitest";
import { findCommand, quoteForCmd, spawnSpec } from "./command.ts";

// 파일 시스템은 바깥 경계라 "있는 파일 목록"으로 대신한다. Windows 경로 규칙은 이 Mac·Linux에서도 같게 검사한다.
function lookup(platform: NodeJS.Platform, pathValue: string, files: string[], pathExt?: string) {
  const present = new Set(files.map((file) => (platform === "win32" ? file.toLowerCase() : file)));
  return {
    platform,
    pathValue,
    pathExt,
    isExecutable: (file: string) => present.has(platform === "win32" ? file.toLowerCase() : file),
  };
}

describe("findCommand", () => {
  it("Windows에서 npm으로 깐 claude는 확장자 없는 sh 파일이 아니라 claude.cmd를 찾는다", () => {
    const found = findCommand(
      "claude",
      lookup("win32", "C:\\Windows\\system32;C:\\Users\\Hong Gil\\AppData\\Roaming\\npm", [
        "C:\\Users\\Hong Gil\\AppData\\Roaming\\npm\\claude",
        "C:\\Users\\Hong Gil\\AppData\\Roaming\\npm\\claude.cmd",
      ], ".COM;.EXE;.BAT;.CMD"),
    );
    expect(found?.toLowerCase()).toBe("c:\\users\\hong gil\\appdata\\roaming\\npm\\claude.cmd");
  });

  it("Windows에서 PATH 순서를 따르고, 같은 폴더에서는 PATHEXT 순서로 .exe가 .cmd보다 먼저다", () => {
    const files = ["C:\\a\\claude.cmd", "C:\\a\\claude.exe", "C:\\b\\claude.exe"];
    expect(findCommand("claude", lookup("win32", "C:\\a;C:\\b", files))?.toLowerCase()).toBe("c:\\a\\claude.exe");
    expect(findCommand("claude", lookup("win32", "C:\\b;C:\\a", files))?.toLowerCase()).toBe("c:\\b\\claude.exe");
  });

  it("Windows PATH의 따옴표로 묶인 폴더도 찾는다", () => {
    const found = findCommand("claude", lookup("win32", '"C:\\Program Files\\Claude";C:\\x', ["C:\\Program Files\\Claude\\claude.exe"]));
    expect(found?.toLowerCase()).toBe("c:\\program files\\claude\\claude.exe");
  });

  it("Mac·Linux에서는 확장자 없는 이름을 PATH 순서로 찾는다", () => {
    const found = findCommand("claude", lookup("darwin", "/usr/bin:/Users/kim/.local/bin", ["/Users/kim/.local/bin/claude", "/Users/kim/.local/bin/claude.cmd"]));
    expect(found).toBe("/Users/kim/.local/bin/claude");
  });

  it("어디에도 없으면 null", () => {
    expect(findCommand("claude", lookup("win32", "C:\\a", []))).toBeNull();
    expect(findCommand("claude", lookup("linux", "", []))).toBeNull();
  });
});

describe("spawnSpec", () => {
  it("Windows .cmd는 셸로 실행하고 공백이 든 경로를 따옴표로 묶는다", () => {
    const spec = spawnSpec("C:\\Users\\Hong Gil\\AppData\\Roaming\\npm\\claude.cmd", ["--settings", "C:\\Users\\Hong Gil\\repo\\settings.json"], "win32");
    expect(spec).toEqual({
      command: '"C:\\Users\\Hong Gil\\AppData\\Roaming\\npm\\claude.cmd" "--settings" "C:\\Users\\Hong Gil\\repo\\settings.json"',
      args: [],
      shell: true,
    });
  });

  it("Windows .exe와 Mac·Linux 실행 파일은 셸 없이 인자를 그대로 넘긴다", () => {
    expect(spawnSpec("C:\\a\\claude.exe", ["--settings", "C:\\b c\\s.json"], "win32")).toEqual({
      command: "C:\\a\\claude.exe",
      args: ["--settings", "C:\\b c\\s.json"],
      shell: false,
    });
    expect(spawnSpec("/usr/local/bin/npm.cmd", ["ci"], "darwin")).toEqual({ command: "/usr/local/bin/npm.cmd", args: ["ci"], shell: false });
  });

  it("cmd.exe가 따옴표 안에서도 바꾸는 \" %가 든 인자는 받지 않는다", () => {
    expect(() => quoteForCmd('a"b')).toThrow();
    expect(() => quoteForCmd("%PATH%")).toThrow();
  });
});
