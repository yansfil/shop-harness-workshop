// Claude Code 세션 기록(JSONL) 한 파일을 읽어 요청·도구 호출·읽지 못한 줄로 바꾼다.
// 기록 형식은 Claude Code 내부 형식이라 버전마다 바뀔 수 있다. 이 파일이 쓰는 줄의 모양을 알아보지 못하면
// 건너뛰지 않고 읽지 못한 줄(줄 번호·이유)로 남긴다.
//
// 요청 하나 = API 응답 하나 = message.id 하나. Claude Code는 응답의 내용 블록(thinking·text·tool_use)마다
// 줄을 따로 쓰고 각 줄에 같은 usage를 싣기 때문에, 같은 message.id는 한 번만 센다.

export interface TokenUsage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export type ToolStatus = "running" | "done" | "error";

export interface ToolCall {
  id: string;
  name: string;
  summary: string;
  startedAt: string;
  durationMs: number | null;
  status: ToolStatus;
}

export interface Request {
  index: number;
  messageId: string;
  at: string;
  tokens: TokenUsage;
  total: number;
  tools: ToolCall[];
}

export interface UnreadableLine {
  line: number;
  afterRequest: number;
  reason: string;
}

/** 다른 세션에서 복사해 온 줄(/branch는 forkedFrom을, --fork-session은 같은 uuid를 남긴다)을 알아보는 데 쓴다. */
export interface SessionTranscript {
  lineCount: number;
  startedAt: string | null;
  updatedAt: string | null;
  requests: Request[];
  unreadable: UnreadableLine[];
  /** 대화 줄(user·assistant·system 등)의 uuid. 갈라진 세션은 원본의 uuid를 그대로 복사한다. */
  uuids: string[];
  /** /branch가 남긴 원본 세션 id. 없으면 null. */
  forkedFromSessionId: string | null;
  /** 시각이 있는 줄마다 uuid(없으면 null)와 시각. 갈라진 세션에서 어느 쪽이 먼저 시작했는지 가릴 때 쓴다. */
  stamps: { uuid: string | null; timestamp: string }[];
}

const UNREADABLE = {
  json: "JSON으로 읽을 수 없어요",
  shape: "알 수 없는 줄 형식이에요",
  usage: "토큰 정보가 없는 응답 줄이에요",
} as const;

type Json = Record<string, unknown>;

/**
 * Claude Code 2.1.323이 세션 기록에 쓰는 줄 종류(본체의 기록 종류 표에서 옮겼다).
 * 이 뷰어는 assistant(요청·도구 호출)와 user(도구 결과)만 쓰고 나머지는 읽고 넘긴다.
 * 표에 없는 종류는 새 버전의 형식일 수 있으므로 읽지 못한 줄로 드러낸다.
 */
const KNOWN_TYPES: ReadonlySet<string> = new Set(
  [
    "user assistant system attachment progress",
    "queue-operation api-request api-request-shape api-request-blob frame-link observer-ref continued-in resume-head-vouch",
    "file-history-snapshot file-history-delta attribution-snapshot",
    "custom-title ai-title tag relocated agent-name agent-color agent-setting mode repl-mode permission-mode",
    "session-owner isolation-latch dev-mods atis-latch worktree-state bridge-session tools-used",
    "data-flow-records data-flow-incomplete derived-from summary pr-link history-suppression ended-by-model",
    "cost-state last-prompt content-replacement memory-mode artifact-comment-monitor artifact-autoreact-ledger fork-context-ref",
  ].flatMap((group) => group.split(" ")),
);

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readUsage(value: unknown): TokenUsage | null {
  if (!isObject(value)) return null;
  const pick = (key: string): number | null => {
    const n = value[key];
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const input = pick("input_tokens");
  const output = pick("output_tokens");
  if (input === null || output === null) return null;
  // 캐시 필드는 캐시를 쓰지 않은 응답에서 빠질 수 있다. 빠진 것은 0토큰이라는 뜻이다.
  return { input, cacheWrite: pick("cache_creation_input_tokens") ?? 0, cacheRead: pick("cache_read_input_tokens") ?? 0, output };
}

function relativeTo(cwd: string | null, filePath: string): string {
  if (cwd !== null && filePath.startsWith(cwd)) return filePath.slice(cwd.length).replace(/^[/\\]/, "");
  return filePath;
}

function summarizeToolInput(name: string, input: unknown, cwd: string | null): string {
  if (!isObject(input)) return "";
  const text = (key: string): string | null => (typeof input[key] === "string" ? input[key] : null);
  const filePath = text("file_path") ?? text("notebook_path");
  if (filePath !== null) return relativeTo(cwd, filePath);
  const pattern = text("pattern");
  if (pattern !== null) return name === "Grep" ? `"${pattern}"` : pattern;
  const command = text("command");
  if (command !== null) return command.length > 80 ? `${command.slice(0, 79)}…` : command;
  return text("description") ?? text("url") ?? text("query") ?? "";
}

/** 줄이 끝난(줄바꿈으로 닫힌) 기록 줄을 차례로 받아 세션 모양을 쌓는다. 파일에 줄이 붙으면 이어서 넣는다. */
export class TranscriptBuilder {
  #lineCount = 0;
  #startedAt: string | null = null;
  #updatedAt: string | null = null;
  readonly #requests: Request[] = [];
  readonly #requestById = new Map<string, Request>();
  readonly #toolById = new Map<string, ToolCall>();
  readonly #unreadable: UnreadableLine[] = [];
  readonly #uuids: string[] = [];
  #forkedFromSessionId: string | null = null;
  readonly #stamps: { uuid: string | null; timestamp: string }[] = [];
  #cwd: string | null = null;

  addLine(raw: string): void {
    this.#lineCount += 1;
    const line = this.#lineCount;
    if (raw.trim() === "") return;
    let record: unknown;
    try {
      record = JSON.parse(raw);
    } catch {
      this.#markUnreadable(line, UNREADABLE.json);
      return;
    }
    if (!isObject(record) || typeof record.type !== "string") {
      this.#markUnreadable(line, UNREADABLE.shape);
      return;
    }
    if (!KNOWN_TYPES.has(record.type)) {
      this.#markUnreadable(line, `알 수 없는 줄 종류예요(${record.type})`);
      return;
    }
    this.#addRecord(record, record.type, line);
  }

  build(): SessionTranscript {
    return {
      lineCount: this.#lineCount,
      startedAt: this.#startedAt,
      updatedAt: this.#updatedAt,
      requests: this.#requests.map((request) => ({ ...request, tokens: { ...request.tokens }, tools: request.tools.map((tool) => ({ ...tool })) })),
      unreadable: [...this.#unreadable],
      uuids: [...this.#uuids],
      forkedFromSessionId: this.#forkedFromSessionId,
      stamps: [...this.#stamps],
    };
  }

  #markUnreadable(line: number, reason: string): void {
    this.#unreadable.push({ line, afterRequest: this.#requests.length, reason });
  }

  #addRecord(record: Json, type: string, line: number): void {
    const timestamp = typeof record.timestamp === "string" ? record.timestamp : null;
    if (timestamp !== null) {
      this.#startedAt ??= timestamp;
      this.#updatedAt = timestamp;
      this.#stamps.push({ uuid: typeof record.uuid === "string" ? record.uuid : null, timestamp });
    }
    if (typeof record.cwd === "string") this.#cwd ??= record.cwd;
    if (typeof record.uuid === "string") this.#uuids.push(record.uuid);
    if (isObject(record.forkedFrom) && typeof record.forkedFrom.sessionId === "string") {
      this.#forkedFromSessionId ??= record.forkedFrom.sessionId;
    }
    // 서브에이전트 대화는 따로 센다(이 화면은 본 대화의 요청만 보인다).
    if (record.isSidechain === true) return;
    if (type === "assistant") this.#addAssistant(record, timestamp, line);
    else if (type === "user") this.#addUser(record, timestamp, line);
  }

  #addAssistant(record: Json, timestamp: string | null, line: number): void {
    const message = record.message;
    if (!isObject(message) || typeof message.id !== "string" || timestamp === null) {
      this.#markUnreadable(line, UNREADABLE.shape);
      return;
    }
    // "<synthetic>"은 Claude Code가 API를 부르지 않고 직접 만든 응답(오류 안내 등)이다. 요청이 아니다.
    if (message.model === "<synthetic>") return;
    const usage = readUsage(message.usage);
    if (usage === null) {
      this.#markUnreadable(line, UNREADABLE.usage);
      return;
    }
    let request = this.#requestById.get(message.id);
    if (request === undefined) {
      request = { index: this.#requests.length + 1, messageId: message.id, at: timestamp, tokens: usage, total: 0, tools: [] };
      this.#requests.push(request);
      this.#requestById.set(message.id, request);
    }
    // 같은 응답의 뒤 줄이 더 늦게 쓰이므로 마지막 줄의 usage를 쓴다(대개 모두 같다).
    request.tokens = usage;
    request.total = usage.input + usage.cacheWrite + usage.cacheRead + usage.output;
    if (!Array.isArray(message.content)) return;
    for (const block of message.content) {
      if (!isObject(block) || block.type !== "tool_use" || typeof block.id !== "string" || typeof block.name !== "string") continue;
      if (this.#toolById.has(block.id)) continue;
      const tool: ToolCall = {
        id: block.id,
        name: block.name,
        summary: summarizeToolInput(block.name, block.input, this.#cwd),
        startedAt: timestamp,
        durationMs: null,
        status: "running",
      };
      request.tools.push(tool);
      this.#toolById.set(block.id, tool);
    }
  }

  #addUser(record: Json, timestamp: string | null, line: number): void {
    const message = record.message;
    // 사람이 쓴 프롬프트는 content가 글자, 도구 결과는 블록 배열이다. 그 밖의 모양은 새 형식일 수 있다.
    if (!isObject(message) || timestamp === null || !(typeof message.content === "string" || Array.isArray(message.content))) {
      this.#markUnreadable(line, UNREADABLE.shape);
      return;
    }
    if (typeof message.content === "string") return;
    for (const block of message.content) {
      if (!isObject(block) || block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
      const tool = this.#toolById.get(block.tool_use_id);
      if (tool === undefined) continue;
      tool.status = block.is_error === true ? "error" : "done";
      tool.durationMs = Math.max(0, Date.parse(timestamp) - Date.parse(tool.startedAt));
    }
  }
}

/** 파일 내용 전체를 한 번에 읽을 때 쓴다. 줄바꿈으로 닫히지 않은 마지막 조각은 아직 쓰는 중인 줄이라 넣지 않는다. */
export function parseTranscript(text: string): SessionTranscript {
  const builder = new TranscriptBuilder();
  const lines = text.split("\n");
  lines.pop();
  for (const line of lines) builder.addLine(line);
  return builder.build();
}
