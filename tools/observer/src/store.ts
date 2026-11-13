// 세션 기록 폴더를 읽어 세션별 요약을 들고 있는다. 파일에 줄이 붙으면 붙은 바이트만 이어서 읽는다.
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import path from "node:path";
import { compareBranch, findBranches, type BranchLink, type Comparison } from "./branches.ts";
import type { ObserverPaths } from "./config.ts";
import { buildInstructionMap, listInstructionFiles, type InstructionMap } from "./instructions.ts";
import { TranscriptBuilder, type Request, type SessionTranscript, type UnreadableLine } from "./transcript.ts";

/** 세션 목록에 들고 있는 최대 개수. 넘으면 가장 오래 손대지 않은 세션부터 내려놓는다. */
export const MAX_SESSIONS = 50;

const NEWLINE = 0x0a;

interface TrackedFile {
  size: number;
  offset: number;
  pending: Buffer;
  builder: TranscriptBuilder;
  transcript: SessionTranscript;
  mtimeMs: number;
}

export interface SessionSummary {
  id: string;
  startedAt: string | null;
  updatedAt: string | null;
  requestCount: number;
  unreadableCount: number;
  branch: BranchLink | null;
}

export interface SessionDetail extends SessionSummary {
  lineCount: number;
  requests: Request[];
  unreadable: UnreadableLine[];
}

export type InstructionResult = { status: "missing" } | ({ status: "ok"; repoName: string } & InstructionMap);

export class SessionStore {
  readonly #paths: ObserverPaths;
  readonly #repoRoot: string;
  readonly #files = new Map<string, TrackedFile>();
  readonly #instructionSizes = new Map<string, number>();
  #branches = new Map<string, BranchLink>();

  constructor(paths: ObserverPaths, repoRoot: string) {
    this.#paths = paths;
    this.#repoRoot = repoRoot;
  }

  get paths(): ObserverPaths {
    return this.#paths;
  }

  /** 폴더를 다시 보고 바뀐 세션 id를 돌려준다(지침 기록이 바뀐 세션 포함). */
  refresh(): string[] {
    const changed = new Set<string>();
    const present = this.#listSessionFiles();
    for (const id of this.#files.keys()) {
      if (!present.has(id)) {
        this.#files.delete(id);
        this.#instructionSizes.delete(id);
        changed.add(id);
      }
    }
    for (const [id, stat] of present) {
      if (this.#readSession(id, stat.size, stat.mtimeMs)) changed.add(id);
      const logSize = this.#instructionLogSize(id);
      if (logSize !== (this.#instructionSizes.get(id) ?? -1)) {
        this.#instructionSizes.set(id, logSize);
        changed.add(id);
      }
    }
    if (changed.size > 0) {
      this.#branches = findBranches([...this.#files].map(([id, file]) => ({ id, transcript: file.transcript })));
    }
    return [...changed].sort();
  }

  list(): SessionSummary[] {
    return [...this.#files.keys()].map((id) => this.#summary(id)).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }

  detail(id: string): SessionDetail | null {
    const file = this.#files.get(id);
    if (file === undefined) return null;
    const { lineCount, requests, unreadable } = file.transcript;
    return { ...this.#summary(id), lineCount, requests, unreadable };
  }

  compare(childId: string): Comparison | null {
    const link = this.#branches.get(childId);
    const child = this.#files.get(childId);
    if (link === undefined || child === undefined) return null;
    const parent = this.#files.get(link.parentId);
    if (parent === undefined) return null;
    return compareBranch(link, childId, parent.transcript, child.transcript);
  }

  instructions(id: string): InstructionResult | null {
    const file = this.#files.get(id);
    if (file === undefined) return null;
    const logPath = path.join(this.#paths.instructionsDir, `${id}.jsonl`);
    if (!existsSync(logPath)) return { status: "missing" };
    const map = buildInstructionMap(readFileSync(logPath, "utf8"), this.#repoRoot, listInstructionFiles(this.#repoRoot), file.transcript.requests);
    return { status: "ok", repoName: path.basename(this.#repoRoot), ...map };
  }

  #summary(id: string): SessionSummary {
    const transcript = this.#files.get(id)?.transcript;
    if (transcript === undefined) throw new Error(`unknown session ${id}`);
    return {
      id,
      startedAt: transcript.startedAt,
      updatedAt: transcript.updatedAt,
      requestCount: transcript.requests.length,
      unreadableCount: transcript.unreadable.length,
      branch: this.#branches.get(id) ?? null,
    };
  }

  #listSessionFiles(): Map<string, { size: number; mtimeMs: number }> {
    const found: { id: string; size: number; mtimeMs: number }[] = [];
    if (!existsSync(this.#paths.projectDir)) return new Map();
    for (const entry of readdirSync(this.#paths.projectDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      // 목록을 읽은 뒤 지워진 파일은 없는 것으로 본다.
      const stat = statSync(path.join(this.#paths.projectDir, entry.name), { throwIfNoEntry: false });
      if (stat === undefined) continue;
      found.push({ id: entry.name.slice(0, -".jsonl".length), size: stat.size, mtimeMs: stat.mtimeMs });
    }
    found.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return new Map(found.slice(0, MAX_SESSIONS).map((file) => [file.id, { size: file.size, mtimeMs: file.mtimeMs }]));
  }

  #instructionLogSize(id: string): number {
    const logPath = path.join(this.#paths.instructionsDir, `${id}.jsonl`);
    return existsSync(logPath) ? statSync(logPath).size : -1;
  }

  /** 새로 붙은 바이트만 읽는다. 파일이 줄었으면(다시 쓰였으면) 처음부터 읽는다. 바뀌었으면 true. */
  #readSession(id: string, size: number, mtimeMs: number): boolean {
    let file = this.#files.get(id);
    if (file !== undefined && file.size === size && file.mtimeMs === mtimeMs) return false;
    if (file === undefined || size < file.offset) {
      const builder = new TranscriptBuilder();
      file = { size: 0, offset: 0, pending: Buffer.alloc(0), builder, transcript: builder.build(), mtimeMs: 0 };
      this.#files.set(id, file);
    }
    const fd = openSync(path.join(this.#paths.projectDir, `${id}.jsonl`), "r");
    try {
      const fresh = Buffer.alloc(size - file.offset);
      const read = readSync(fd, fresh, 0, fresh.length, file.offset);
      file.offset += read;
      const bytes = Buffer.concat([file.pending, fresh.subarray(0, read)]);
      // 줄바꿈 바이트는 UTF-8 여러 바이트 글자 안에 나오지 않으므로 여기서 잘라도 글자가 깨지지 않는다.
      const lastNewline = bytes.lastIndexOf(NEWLINE);
      if (lastNewline !== -1) {
        for (const line of bytes.subarray(0, lastNewline).toString("utf8").split("\n")) file.builder.addLine(line);
      }
      file.pending = Buffer.from(bytes.subarray(lastNewline + 1));
    } finally {
      closeSync(fd);
    }
    file.size = size;
    file.mtimeMs = mtimeMs;
    file.transcript = file.builder.build();
    return true;
  }
}
