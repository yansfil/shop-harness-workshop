// 채점: 기본은 시작 태그(start/<브랜치>) 이후 바뀐 코드, --all은 레포 전체.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { allFiles, changesSince, fileAtTag, startTag, type FileChange } from "./git.ts";
import { RULES, checkContent, expectLineRanges, isMigrationFile, isTestFile, type RuleId, type Violation } from "./rules.ts";

export interface RuleCount {
  id: RuleId;
  title: string;
  /** null이면 이 범위에서는 검사할 수 없는 규칙(--all의 diff 규칙). */
  count: number | null;
}

export interface GradeResult {
  mode: "since-start" | "all";
  branch: string | null;
  tag: string | null;
  filesChecked: number;
  violations: Violation[];
  rules: RuleCount[];
}

function readCurrent(root: string, file: string): string | null {
  const full = path.join(root, file);
  return existsSync(full) ? readFileSync(full, "utf8") : null;
}

function sortViolations(violations: Violation[]): Violation[] {
  const order = new Map(RULES.map((rule, index) => [rule.id, index]));
  return violations.sort((a, b) => (order.get(a.rule) ?? 0) - (order.get(b.rule) ?? 0) || a.file.localeCompare(b.file) || a.line - b.line || a.message.localeCompare(b.message));
}

function countRules(violations: readonly Violation[], mode: GradeResult["mode"]): RuleCount[] {
  return RULES.map((rule) => ({
    id: rule.id,
    title: rule.title,
    count: mode === "all" && rule.needsBase ? null : violations.filter((violation) => violation.rule === rule.id).length,
  }));
}

function checkExpectChanges(root: string, tag: string, change: FileChange): Violation[] {
  if (change.oldPath === null || !isTestFile(change.oldPath)) return [];
  const file = change.newPath ?? change.oldPath;
  if (change.newPath === null) return [{ rule: "test-expect-change", file, line: 1, message: "기존 테스트 파일을 지웠어요" }];
  if (change.removedLines.length === 0) return [];
  const ranges = expectLineRanges(change.oldPath, fileAtTag(root, tag, change.oldPath));
  const reported = new Set<number>();
  const violations: Violation[] = [];
  for (const removed of change.removedLines) {
    const range = ranges.find(([start, end]) => removed.oldLine >= start && removed.oldLine <= end);
    if (range === undefined || reported.has(range[0])) continue;
    reported.add(range[0]);
    violations.push({ rule: "test-expect-change", file, line: removed.newLine, message: `기존 expect(시작 태그 ${range[0]}줄)를 바꿨어요` });
  }
  return violations;
}

function checkMigrationChange(change: FileChange): Violation[] {
  if (change.oldPath === null || !isMigrationFile(change.oldPath)) return [];
  if (change.newPath === null) return [{ rule: "migration-change", file: change.oldPath, line: 1, message: "적용된 마이그레이션을 지웠어요" }];
  const lines = [...(change.addedLines ?? []), ...change.removedLines.map((removed) => removed.newLine)];
  return [{ rule: "migration-change", file: change.newPath, line: lines.length === 0 ? 1 : Math.min(...lines), message: "적용된 마이그레이션을 고쳤어요" }];
}

export function gradeSinceStart(root: string): GradeResult {
  const { branch, tag } = startTag(root);
  const changes = changesSince(root, tag);
  const violations: Violation[] = [];
  for (const change of changes) {
    violations.push(...checkExpectChanges(root, tag, change), ...checkMigrationChange(change));
    if (change.newPath === null) continue;
    const content = readCurrent(root, change.newPath);
    if (content === null) continue;
    const added = change.addedLines;
    violations.push(...checkContent(change.newPath, content).filter((violation) => added === null || added.has(violation.line)));
  }
  return { mode: "since-start", branch, tag, filesChecked: changes.length, violations: sortViolations(violations), rules: countRules(violations, "since-start") };
}

export function gradeAll(root: string): GradeResult {
  const files = allFiles(root).filter((file) => existsSync(path.join(root, file)));
  const violations: Violation[] = [];
  for (const file of files) {
    const content = readCurrent(root, file);
    if (content !== null) violations.push(...checkContent(file, content));
  }
  return { mode: "all", branch: null, tag: null, filesChecked: files.length, violations: sortViolations(violations), rules: countRules(violations, "all") };
}
