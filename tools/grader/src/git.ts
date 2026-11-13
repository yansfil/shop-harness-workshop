// 채점 범위를 git에서 읽는다. 셸을 거치지 않고 git을 바로 실행하므로 Mac·Windows에서 같게 돈다.
import { execFileSync } from "node:child_process";

export class GradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GradeError";
  }
}

export function git(root: string, args: readonly string[]): string {
  try {
    return execFileSync("git", ["-c", "core.quotepath=off", ...args], { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String(error.stderr).trim() : "";
    throw new GradeError(`git ${args[0] ?? ""} 실패: ${stderr || String(error)}`);
  }
}

export interface RemovedLine {
  oldLine: number;
  /** 지워진 자리의 새 파일 줄 번호(그 자리 바로 뒤에 오는 줄). */
  newLine: number;
}

export interface FileChange {
  /** 시작 태그 때 경로. 새로 생긴 파일이면 null. */
  oldPath: string | null;
  /** 지금 경로. 지운 파일이면 null. */
  newPath: string | null;
  /** 새로 생기거나 바뀐 줄(지금 파일 기준). null이면 파일 전체가 새것이다. */
  addedLines: Set<number> | null;
  removedLines: RemovedLine[];
}

/** 현재 브랜치 이름과 그 시작 태그. 없으면 그 사실을 말하는 GradeError. */
export function startTag(root: string): { branch: string; tag: string } {
  let branch: string;
  try {
    branch = execFileSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    throw new GradeError("브랜치에 있지 않아 시작 태그를 정할 수 없어요. 실습 브랜치(예: day1-b)로 checkout 하세요. 레포 전체는 --all로 채점할 수 있어요.");
  }
  const tag = `start/${branch}`;
  const exists = execFileSync("git", ["tag", "--list", tag], { cwd: root, encoding: "utf8" }).trim() !== "";
  if (!exists) {
    throw new GradeError(`시작 태그 ${tag}가 없어요. 실습 브랜치(day1-a, day1-b 등)에서 채점하거나, 레포 전체는 --all로 채점하세요.`);
  }
  return { branch, tag };
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** `git diff --unified=0` 출력을 파일별 바뀐 줄로 나눈다. */
export function parseUnifiedDiff(diff: string): FileChange[] {
  const changes: FileChange[] = [];
  let current: FileChange | null = null;
  let oldCursor = 0;
  let newCursor = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      current = { oldPath: null, newPath: null, addedLines: new Set(), removedLines: [] };
      changes.push(current);
      continue;
    }
    if (current === null) continue;
    if (line.startsWith("--- ")) {
      current.oldPath = line === "--- /dev/null" ? null : line.slice("--- a/".length);
    } else if (line.startsWith("+++ ")) {
      current.newPath = line === "+++ /dev/null" ? null : line.slice("+++ b/".length);
    } else if (line.startsWith("@@")) {
      const match = HUNK.exec(line);
      if (match === null) throw new GradeError(`git diff의 구간 머리를 읽지 못했어요: ${line}`);
      oldCursor = Number(match[1]);
      newCursor = Number(match[3]);
      // 길이가 0인 구간의 시작 번호는 "그 줄 뒤"를 뜻한다.
      if (match[2] === "0") oldCursor += 1;
      if (match[4] === "0") newCursor += 1;
    } else if (line.startsWith("+")) {
      current.addedLines?.add(newCursor);
      newCursor += 1;
    } else if (line.startsWith("-")) {
      current.removedLines.push({ oldLine: oldCursor, newLine: newCursor });
      oldCursor += 1;
    }
  }
  return changes;
}

/** 시작 태그 이후 바뀐 파일(커밋·스테이지·작업 트리·추적하지 않는 새 파일 모두). */
export function changesSince(root: string, tag: string): FileChange[] {
  const diff = git(root, ["diff", "--no-color", "--no-ext-diff", "--no-renames", "--unified=0", tag, "--"]);
  const changes = parseUnifiedDiff(diff);
  const untracked = git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter((file) => file !== "");
  for (const file of untracked) changes.push({ oldPath: null, newPath: file, addedLines: null, removedLines: [] });
  return changes;
}

/** 레포의 모든 파일(추적 중 + 무시되지 않은 새 파일). */
export function allFiles(root: string): string[] {
  return git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).split("\0").filter((file) => file !== "");
}

export function fileAtTag(root: string, tag: string, file: string): string {
  return git(root, ["show", `${tag}:${file}`]);
}
