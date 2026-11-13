// InstructionsLoaded Hook 테스트: Claude Code가 하듯 stdin으로 JSON을 넘겨 진짜 node 프로세스로 돌린다.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const HOOK = path.resolve(import.meta.dirname, "..", "hooks", "instructions-loaded.mjs");
const dirs: string[] = [];

function runHook(input: unknown, env: Record<string, string>): { status: number | null; stderr: string } {
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" });
  return { status: result.status, stderr: result.stderr };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const EVENT = { session_id: "33bc43b7-fd11-4bcd-b82e-f24281a5496a", hook_event_name: "InstructionsLoaded", file_path: "/repo/apps/api/CLAUDE.md", memory_type: "Project", load_reason: "nested_traversal", trigger_file_path: "/repo/apps/api/src/a.ts" };

describe("InstructionsLoaded Hook", () => {
  it("CLAUDE_CONFIG_DIR/observer/instructions/<session_id>.jsonl에 받은 내용과 기록 시각을 한 줄로 남긴다", () => {
    const configDir = mkdtempSync(path.join(os.tmpdir(), "hook-"));
    dirs.push(configDir);
    expect(runHook(EVENT, { CLAUDE_CONFIG_DIR: configDir }).status).toBe(0);
    expect(runHook({ ...EVENT, load_reason: "path_glob_match" }, { CLAUDE_CONFIG_DIR: configDir }).status).toBe(0);
    const lines = readFileSync(path.join(configDir, "observer", "instructions", `${EVENT.session_id}.jsonl`), "utf8").trim().split("\n");
    expect(lines.map((line) => (JSON.parse(line) as { load_reason: string }).load_reason)).toEqual(["nested_traversal", "path_glob_match"]);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({ ...EVENT, observed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown });
  });

  it("CLAUDE_CONFIG_DIR이 없으면 원래 ~/.claude에 쓰지 않고 실패한다", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "hook-home-"));
    dirs.push(home);
    const result = runHook(EVENT, { HOME: home });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CLAUDE_CONFIG_DIR");
    expect(existsSync(path.join(home, ".claude"))).toBe(false);
  });
});
