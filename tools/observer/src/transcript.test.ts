// 세션 기록 읽기 테스트. 고정 자료(tools/observer/fixtures)는 Claude Code 2.1.323으로 실제 실행한 세션에서
// 경로·개인 정보를 걷어낸 것이다. 기대값은 같은 실행의 `claude -p --output-format json` 결과(요청 수·토큰 합계)와 맞췄다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findBranches } from "./branches.ts";
import { buildInstructionMap } from "./instructions.ts";
import { parseTranscript, TranscriptBuilder } from "./transcript.ts";

const fixture = (name: string): string => readFileSync(path.join(import.meta.dirname, "..", "fixtures", name), "utf8");

function assistantLine(messageId: string, block: unknown, usage = { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 2000, output_tokens: 40 }): string {
  return JSON.stringify({
    type: "assistant",
    uuid: `u-${messageId}-${JSON.stringify(block).length}`,
    timestamp: "2026-11-16T01:00:00.000Z",
    message: { id: messageId, model: "claude-haiku-5-5", content: [block], usage },
  });
}

describe("요청별 토큰", () => {
  it("같은 message.id로 나뉜 줄(thinking·text·tool_use)은 요청 하나로 한 번만 센다", () => {
    const text = [
      assistantLine("msg_A", { type: "thinking", thinking: "" }),
      assistantLine("msg_A", { type: "text", text: "읽어 볼게요" }),
      assistantLine("msg_A", { type: "tool_use", id: "toolu_1", name: "Read", input: { file_path: "a.ts" } }),
      "",
    ].join("\n");
    const { requests } = parseTranscript(text);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.tokens).toEqual({ input: 3, cacheWrite: 100, cacheRead: 2000, output: 40 });
    expect(requests[0]?.total).toBe(2143);
    expect(requests[0]?.tools.map((tool) => tool.name)).toEqual(["Read"]);
  });

  it("실제 세션: 요청 5개, 토큰 4종 합계가 Claude Code가 보고한 사용량과 같다", () => {
    const { requests } = parseTranscript(fixture("session-original.jsonl"));
    // claude -p 결과의 usage: input 10, cache_creation 49981, cache_read 196317, output 1159
    const sum = (key: "input" | "cacheWrite" | "cacheRead" | "output"): number => requests.reduce((total, request) => total + request.tokens[key], 0);
    expect(requests).toHaveLength(5);
    expect([sum("input"), sum("cacheWrite"), sum("cacheRead"), sum("output")]).toEqual([10, 49981, 196317, 1159]);
    expect(requests.map((request) => request.tools.map((tool) => tool.name).join(","))).toEqual(["Read", "Read", "Bash", "Bash", ""]);
  });

  it("도구 결과가 오면 걸린 시간과 끝남을, 아직 안 왔으면 진행 중을 보인다", () => {
    const builder = new TranscriptBuilder();
    builder.addLine(assistantLine("msg_A", { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "npm run verify" } }));
    expect(builder.build().requests[0]?.tools[0]).toMatchObject({ status: "running", durationMs: null, summary: "npm run verify" });
    builder.addLine(
      JSON.stringify({ type: "user", timestamp: "2026-11-16T01:00:14.200Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] } }),
    );
    expect(builder.build().requests[0]?.tools[0]).toMatchObject({ status: "done", durationMs: 14200 });
  });
});

describe("읽지 못한 줄", () => {
  it("건너뛰지 않고 줄 번호·몇 번째 요청 뒤인지·이유를 남긴다", () => {
    const lines = fixture("session-original.jsonl").split("\n");
    lines.pop();
    const firstAssistant = lines.findIndex((line) => line.includes('"type": "assistant"'));
    lines.splice(firstAssistant + 2, 0, '{"type": "assistant", "message": {"id": "msg_x", "con');
    lines.push('{"hello": "world"}');
    const { unreadable, requests, lineCount } = parseTranscript(`${lines.join("\n")}\n`);
    expect(lineCount).toBe(lines.length);
    expect(unreadable).toEqual([
      { line: firstAssistant + 3, afterRequest: 1, reason: "JSON으로 읽을 수 없어요" },
      { line: lines.length, afterRequest: 5, reason: "알 수 없는 줄 형식이에요" },
    ]);
    expect(requests).toHaveLength(5);
  });

  it("Claude Code가 쓰지 않는 줄 종류와 모양이 다른 user 줄은 읽지 못한 줄로 센다", () => {
    const lines = [
      assistantLine("msg_A", { type: "text", text: "a" }),
      JSON.stringify({ type: "future-assistant-v2", timestamp: "2026-11-16T00:00:00Z", message: { id: "new-format" } }),
      JSON.stringify({ type: "user", timestamp: "2026-11-16T00:00:00Z", message: 42 }),
      JSON.stringify({ type: "file-history-snapshot", messageId: "m", snapshot: {} }),
    ];
    expect(parseTranscript(`${lines.join("\n")}\n`).unreadable).toEqual([
      { line: 2, afterRequest: 1, reason: "알 수 없는 줄 종류예요(future-assistant-v2)" },
      { line: 3, afterRequest: 1, reason: "알 수 없는 줄 형식이에요" },
    ]);
  });

  it("실제 세션 기록의 줄은 모두 읽는다", () => {
    for (const name of ["session-original.jsonl", "session-fork.jsonl", "session-branch.jsonl"]) {
      expect(parseTranscript(fixture(name)).unreadable).toEqual([]);
    }
  });

  it("토큰 정보가 없는 응답 줄도 읽지 못한 줄로 센다", () => {
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-11-16T01:00:00.000Z", message: { id: "msg_A", model: "claude-haiku-5-5", content: [] } });
    expect(parseTranscript(`${line}\n`).unreadable).toEqual([{ line: 1, afterRequest: 0, reason: "토큰 정보가 없는 응답 줄이에요" }]);
  });

  it("줄바꿈으로 닫히지 않은 마지막 조각은 아직 쓰는 중이라 읽지 못한 줄로 세지 않는다", () => {
    const whole = `${assistantLine("msg_A", { type: "text", text: "a" })}\n`;
    const result = parseTranscript(`${whole}{"type": "assist`);
    expect(result.unreadable).toEqual([]);
    expect(result.lineCount).toBe(1);
  });
});

describe("갈라진 세션", () => {
  const original = { id: "e5fb3173-7774-44a9-a7f5-7314601088bf", transcript: parseTranscript(fixture("session-original.jsonl")) };
  const fork = { id: "99edf449-773b-4f9f-a13c-5d934557b7e2", transcript: parseTranscript(fixture("session-fork.jsonl")) };
  const branch = { id: "b7a2c4e1-3d5f-4a6b-8c9d-0e1f2a3b4c5d", transcript: parseTranscript(fixture("session-branch.jsonl")) };

  it("--fork-session으로 만든 세션은 원본을 찾고 같은 요청 수를 센다", () => {
    const links = findBranches([fork, original]);
    expect(links.get(fork.id)).toEqual({ parentId: original.id, kind: "fork", sharedRequests: 5 });
    expect(links.has(original.id)).toBe(false);
  });

  it("/branch로 만든 세션은 forkedFrom으로 원본을 찾는다", () => {
    const links = findBranches([original, fork, branch]);
    expect(links.get(branch.id)).toEqual({ parentId: original.id, kind: "branch", sharedRequests: 5 });
    expect(links.get(fork.id)?.parentId).toBe(original.id);
  });

  it("uuid를 나누지 않는 세션끼리는 갈라진 것으로 보지 않는다", () => {
    const other = { id: "other", transcript: parseTranscript(`${assistantLine("msg_Z", { type: "text", text: "z" })}\n`) };
    expect(findBranches([original, other]).size).toBe(0);
  });
});

describe("지침 지도", () => {
  it("Hook 기록으로 읽힌 지침의 이유·계기 파일·몇 번째 요청 뒤인지를, 기록에 없는 레포 지침은 안 읽힘으로 둔다", () => {
    const { requests } = parseTranscript(fixture("session-original.jsonl"));
    const root = "/Users/student/shop-harness-workshop";
    const map = buildInstructionMap(fixture("instructions-original.jsonl"), root, ["CLAUDE.md", "apps/api/CLAUDE.md", "apps/web/CLAUDE.md", ".claude/rules/money.md"], requests);
    const byPath = new Map(map.files.map((file) => [file.path, file]));
    expect(byPath.get("CLAUDE.md")?.loads[0]).toMatchObject({ reason: "session_start", afterRequest: 0, trigger: null });
    expect(byPath.get("apps/api/CLAUDE.md")?.loads[0]).toMatchObject({ reason: "nested_traversal", afterRequest: 1, trigger: "apps/api/src/orders/web/order-controller.ts" });
    expect(byPath.get(".claude/rules/layering.md")?.loads[0]).toMatchObject({ reason: "path_glob_match", afterRequest: 2, trigger: "apps/api/src/orders/application/order-service.ts" });
    expect(byPath.get("apps/web/CLAUDE.md")?.loads).toEqual([]);
    expect(byPath.get("/Users/student/.claude/CLAUDE.md")?.insideRepo).toBe(false);
    expect(map.unreadable).toEqual([]);
  });

  it("알아볼 수 없는 기록 줄은 줄 번호와 함께 남긴다", () => {
    const map = buildInstructionMap('{"observed_at":"x"}\nnot json\n', "/repo", [], []);
    expect(map.unreadable.map((problem) => problem.line)).toEqual([1, 2]);
  });
});
