// 채점: 기본은 시작 태그(start/<브랜치>) 이후 바뀐 코드, --all은 레포 전체.
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { allFiles, changesSince, fileAtTag, newLineOf, startTag, type FileChange } from "./git.ts";
import { RULES, findViolations, testCases, isMigrationFile, isTestFile, type RuleId, type Violation } from "./rules.ts";

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
 * 규칙 1~4는 이것으로 지금 위반 중 시작 태그 때 없던 것만 센다.
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

/**
 * before 중 after와 같은 순서로 짝지을 수 없는 것. 짝은 최장 공통 부분 수열로 가장 많이 짓는다(after 사이사이에 더 있어도 된다).
 * 바뀜·빠짐·순서 바뀜이 여기 남는다.
 */
function missingInOrder<T>(before: readonly T[], after: readonly T[], same: (a: T, b: T) => boolean): T[] {
  // longest[i][j] = before[i..]와 after[j..]의 최장 공통 부분 수열 길이.
  const longest = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0));
  const at = (i: number, j: number): number => longest[i]?.[j] ?? 0;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const row = longest[i] ?? [];
      row[j] = same(before[i] as T, after[j] as T) ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const missing: T[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length) {
    if (j < after.length && same(before[i] as T, after[j] as T) && at(i, j) === at(i + 1, j + 1) + 1) {
      i += 1;
      j += 1;
    } else if (j < after.length && at(i, j + 1) === at(i, j)) {
      j += 1;
    } else {
      missing.push(before[i] as T);
      i += 1;
    }
  }
  return missing;
}

/**
 * 규칙 7: 시작 태그 때 있던 테스트 케이스마다 그 기대 목록이 지금 같은 케이스에 같은 순서로 남아 있는지 본다.
 * 새 기대·새 테스트는 괜찮고, 바뀌거나 빠지거나 순서가 바뀐 기대, 제목이 사라진 케이스의 기대는 위반이다.
 */
function checkExpectChanges(root: string, tag: string, change: FileChange): Violation[] {
  if (change.oldPath === null || !isTestFile(change.oldPath)) return [];
  if (change.newPath === null) return [{ rule: "test-expect-change", file: change.oldPath, line: 1, message: "기존 테스트 파일을 지웠어요" }];
  const file = change.newPath;
  const now = readCurrent(root, file);
  const after = new Map((now === null ? [] : testCases(file, now)).map((testCase) => [testCase.title, testCase.expectations]));
  const violations: Violation[] = [];
  for (const { title, expectations } of testCases(change.oldPath, fileAtTag(root, tag, change.oldPath))) {
    const current = after.get(title);
    const missing = current === undefined ? expectations : missingInOrder(expectations, current, (a, b) => a.text === b.text);
    for (const expectation of missing) {
      const name = title.split(" › ").at(-1) ?? title;
      const message = current === undefined ? `테스트 "${name}"가 사라졌어요(시작 태그 ${String(expectation.line)}줄의 기대)` : `기존 기대를 바꾸거나 빼거나 순서를 바꿨어요(시작 태그 ${String(expectation.line)}줄, "${name}")`;
      violations.push({ rule: "test-expect-change", file, line: newLineOf(change, expectation.line), message });
    }
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
