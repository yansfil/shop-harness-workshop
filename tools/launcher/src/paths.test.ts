import { describe, expect, it } from "vitest";
import { isInsideOrEqual } from "./paths.ts";

describe("isInsideOrEqual", () => {
  it.each([
    ["같은 경로", "/home/kim/.claude", "/home/kim/.claude", true],
    ["자식", "/home/kim/.claude/projects", "/home/kim/.claude", true],
    ["손자", "/home/kim/.claude/projects/repo", "/home/kim/.claude", true],
    ["부모", "/home/kim", "/home/kim/.claude", false],
    ["'..linked' 이름의 자식", "/home/kim/.claude/..linked", "/home/kim/.claude", true],
    ["'...' 이름의 자식", "/home/kim/.claude/...", "/home/kim/.claude", true],
    ["'..foo' 이름의 손자", "/home/kim/.claude/..foo/bar", "/home/kim/.claude", true],
    ["형제 claude-x", "/home/kim/.claude-x", "/home/kim/.claude", false],
    ["끝 구분자가 붙은 같은 경로", "/home/kim/.claude/", "/home/kim/.claude", true],
  ] as const)("Mac·Linux: %s", (_case, child, parent, expected) => {
    expect(isInsideOrEqual(child, parent, "darwin")).toBe(expected);
  });

  it.each([
    ["대소문자만 다른 같은 경로", "c:\\USERS\\Kim\\.Claude", "C:\\Users\\kim\\.claude", true],
    ["대소문자 다른 자식", "C:\\users\\KIM\\.claude\\Projects", "c:\\Users\\kim\\.claude", true],
    ["'..linked' 이름의 자식", "C:\\Users\\kim\\.claude\\..linked", "C:\\Users\\kim\\.claude", true],
    ["부모", "C:\\Users\\kim", "C:\\Users\\kim\\.claude", false],
    ["다른 드라이브", "D:\\Users\\kim\\.claude", "C:\\Users\\kim\\.claude", false],
    ["형제 claude-x", "C:\\Users\\kim\\.claude-x", "C:\\Users\\kim\\.claude", false],
  ] as const)("Windows: %s", (_case, child, parent, expected) => {
    expect(isInsideOrEqual(child, parent, "win32")).toBe(expected);
  });
});
