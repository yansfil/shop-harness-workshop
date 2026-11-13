// 지침 지도: InstructionsLoaded Hook 기록(tools/observer/hooks/instructions-loaded.mjs가 남김)과
// 레포 안의 지침 파일(CLAUDE.md·CLAUDE.local.md·.claude/rules/**/*.md)을 합쳐, 파일마다 읽혔는지·언제·왜·어떤 파일 때문에를 만든다.
import { readdirSync } from "node:fs";
import path from "node:path";
import type { Request } from "./transcript.ts";

export interface InstructionLoad {
  at: string;
  /** 이 시각까지 끝난 요청 수. 0이면 첫 요청 전(세션 시작할 때). */
  afterRequest: number;
  reason: string;
  /** 지침을 읽게 만든 파일(레포 기준 상대 경로). 세션 시작처럼 없으면 null. */
  trigger: string | null;
  memoryType: string | null;
}

export interface InstructionFile {
  /** 레포 안이면 레포 기준 상대 경로(/ 구분), 밖이면 절대 경로. */
  path: string;
  insideRepo: boolean;
  loads: InstructionLoad[];
}

export interface InstructionLogProblem {
  line: number;
  reason: string;
}

export interface InstructionMap {
  files: InstructionFile[];
  unreadable: InstructionLogProblem[];
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "data", "coverage"]);

/** 레포 안의 지침 파일 목록(상대 경로, / 구분, 정렬). 읽히지 않은 지침도 지도에 보이려고 쓴다. */
export function listInstructionFiles(repoRoot: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full);
        continue;
      }
      const rel = path.relative(repoRoot, full).split(path.sep).join("/");
      const inRules = /(^|\/)\.claude\/rules\/.+\.md$/.test(rel);
      if (entry.name === "CLAUDE.md" || entry.name === "CLAUDE.local.md" || inRules) found.push(rel);
    }
  };
  walk(repoRoot);
  return found.sort();
}

function toRepoPath(repoRoot: string, filePath: string): { path: string; insideRepo: boolean } {
  const rel = path.relative(repoRoot, filePath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return { path: filePath.split(path.sep).join("/"), insideRepo: false };
  return { path: rel.split(path.sep).join("/"), insideRepo: true };
}

function requestsDoneBy(requests: readonly Request[], at: string): number {
  let done = 0;
  for (const request of requests) if (request.at <= at) done += 1;
  return done;
}

/** Hook 기록(JSONL 텍스트)을 읽는다. 알아볼 수 없는 줄은 건너뛰지 않고 줄 번호와 이유로 남긴다. */
export function buildInstructionMap(logText: string, repoRoot: string, repoFiles: readonly string[], requests: readonly Request[]): InstructionMap {
  const files = new Map<string, InstructionFile>(repoFiles.map((file) => [file, { path: file, insideRepo: true, loads: [] }]));
  const unreadable: InstructionLogProblem[] = [];
  const lines = logText.split("\n");
  lines.pop();
  for (const [index, raw] of lines.entries()) {
    if (raw.trim() === "") continue;
    let entry: unknown;
    try {
      entry = JSON.parse(raw);
    } catch {
      unreadable.push({ line: index + 1, reason: "JSON으로 읽을 수 없어요" });
      continue;
    }
    if (typeof entry !== "object" || entry === null) {
      unreadable.push({ line: index + 1, reason: "알 수 없는 줄 형식이에요" });
      continue;
    }
    const record = entry as Record<string, unknown>;
    const { file_path: filePath, load_reason: reason, observed_at: at } = record;
    if (typeof filePath !== "string" || typeof reason !== "string" || typeof at !== "string") {
      unreadable.push({ line: index + 1, reason: "file_path·load_reason·시각이 없는 줄이에요" });
      continue;
    }
    const target = toRepoPath(repoRoot, filePath);
    const trigger = typeof record.trigger_file_path === "string" ? toRepoPath(repoRoot, record.trigger_file_path).path : null;
    let file = files.get(target.path);
    if (file === undefined) {
      file = { path: target.path, insideRepo: target.insideRepo, loads: [] };
      files.set(target.path, file);
    }
    file.loads.push({
      at,
      afterRequest: requestsDoneBy(requests, at),
      reason,
      trigger,
      memoryType: typeof record.memory_type === "string" ? record.memory_type : null,
    });
  }
  const sorted = [...files.values()].sort((a, b) => (a.insideRepo === b.insideRepo ? a.path.localeCompare(b.path) : a.insideRepo ? 1 : -1));
  return { files: sorted, unreadable };
}
