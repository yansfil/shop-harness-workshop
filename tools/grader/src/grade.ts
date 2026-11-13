// 채점: 기본은 시작 태그(start/<브랜치>) 이후 바뀐 코드, --all은 레포 전체.
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { allFiles, changesSince, fileAtTag, newLineOf, startTag, type FileChange } from "./git.ts";
import { RULES, expectStatements, findViolations, isMigrationFile, isTestFile, type RuleId, type Violation } from "./rules.ts";

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

/** 지금 작업 트리의 파일 내용. 지웠거나 일반 파일이 아니면(폴더를 가리키는 링크 등) null. */
function readCurrent(root: string, file: string): string | null {
  const stat = lstatSync(path.join(root, file), { throwIfNoEntry: false });
  return stat?.isFile() === true ? readFileSync(path.join(root, file), "utf8") : null;
}

/**
 * 시작 태그 때와 지금의 문장을 맞춰 보고, items 중 against에 짝이 없는 것을 돌려준다(같은 문장이 여러 번이면 개수까지 맞춘다).
 * 줄 단위 diff는 여러 줄 문장의 한 줄만 바뀌거나, 모양이 같은 문장이 붙어 있으면 바뀐 줄이 엉뚱한 문장에 걸린다.
 * 문장끼리 비교하면 diff가 어떻게 줄을 맞췄든 결과가 같다.
 * 규칙 1~4: 지금 위반 중 시작 태그 때 없던 것. 규칙 7: 시작 태그 때 expect 중 지금 그대로 남지 않은 것.
 */
export function unmatchedStatements<T extends { statement: string }>(items: readonly T[], against: readonly { statement: string }[]): T[] {
  const left = new Map<string, number>();
  for (const { statement } of against) left.set(statement, (left.get(statement) ?? 0) + 1);
  return items.filter(({ statement }) => {
    const count = left.get(statement) ?? 0;
    if (count > 0) left.set(statement, count - 1);
    return count === 0;
  });
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
  if (change.newPath === null) return [{ rule: "test-expect-change", file: change.oldPath, line: 1, message: "기존 테스트 파일을 지웠어요" }];
  const file = change.newPath;
  const before = expectStatements(change.oldPath, fileAtTag(root, tag, change.oldPath));
  const now = readCurrent(root, file);
  const changed = unmatchedStatements(before, now === null ? [] : expectStatements(file, now));
  return changed.map((expectation) => ({ rule: "test-expect-change", file, line: newLineOf(change, expectation.line), message: `기존 expect(시작 태그 ${expectation.line}줄)를 바꿨어요` }));
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
    const now = findViolations(change.newPath, content);
    if (now.length === 0) continue;
    const before = change.oldPath === null ? [] : findViolations(change.newPath, fileAtTag(root, tag, change.oldPath));
    violations.push(...unmatchedStatements(now, before).map((found) => found.violation));
  }
  return { mode: "since-start", branch, tag, filesChecked: changes.length, violations: sortViolations(violations), rules: countRules(violations, "since-start") };
}

export function gradeAll(root: string): GradeResult {
  const files = allFiles(root).filter((file) => lstatSync(path.join(root, file), { throwIfNoEntry: false })?.isFile() === true);
  const violations: Violation[] = [];
  for (const file of files) {
    const content = readCurrent(root, file);
    if (content !== null) violations.push(...findViolations(file, content).map((found) => found.violation));
  }
  return { mode: "all", branch: null, tag: null, filesChecked: files.length, violations: sortViolations(violations), rules: countRules(violations, "all") };
}
