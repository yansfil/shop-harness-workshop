// 채점 규칙 6개. 모두 결정적이고 모델을 부르지 않는다.
// 1~4는 파일 내용을 TypeScript 구문 트리로 읽어 검사하고, 5·6은 시작 태그와의 차이(diff)로 검사한다.
// 규칙의 설명과 예시는 docs/rules/와 docs/architecture.md에 있다.
import path from "node:path";
import ts from "typescript";

export type RuleId = "layer-import" | "new-date" | "request-customer-id" | "status-assignment" | "test-expect-change" | "migration-change";

export interface RuleInfo {
  id: RuleId;
  title: string;
  /** diff가 있어야 검사할 수 있는 규칙(--all에서는 해당 없음). */
  needsBase: boolean;
}

export const RULES: readonly RuleInfo[] = [
  { id: "layer-import", title: "계층 import 방향", needsBase: false },
  { id: "new-date", title: "new Date() 사용", needsBase: false },
  { id: "request-customer-id", title: "요청의 customerId", needsBase: false },
  { id: "status-assignment", title: "전이 함수 밖 status 대입", needsBase: false },
  { id: "test-expect-change", title: "기존 테스트 expect 변경", needsBase: true },
  { id: "migration-change", title: "기존 마이그레이션 수정", needsBase: true },
];

export interface Violation {
  rule: RuleId;
  file: string;
  line: number;
  message: string;
}

type Layer = "web" | "application" | "domain" | "infra";

const LAYER_PATH = /^apps\/api\/src\/([^/]+)\/(web|application|domain|infra)\//;
/** 여러 모듈이 같이 쓰는 모듈. 계층 방향 검사에서 빠진다. */
const SHARED_MODULE = "shared";

/** 계층마다 가져오면 안 되는 계층(docs/architecture.md의 import 방향 표). */
const FORBIDDEN_TARGETS: Record<Layer, readonly Layer[]> = {
  web: ["infra"],
  application: ["web", "infra"],
  domain: ["web", "application", "infra"],
  infra: ["web", "application"],
};

/** DB 패키지는 infra만 쓴다. */
const DB_PACKAGE = "@grabmarket/db";

function layerOf(file: string): { module: string; layer: Layer } | null {
  const match = LAYER_PATH.exec(file);
  if (match === null) return null;
  return { module: match[1] ?? "", layer: match[2] as Layer };
}

function isTypeScript(file: string): boolean {
  return /\.(ts|tsx|mts|cts)$/.test(file) && !file.endsWith(".d.ts");
}

/** 규칙 1~4가 보는 파일 범위. */
function inServerCode(file: string): boolean {
  return /^(apps\/api\/|packages\/[^/]+\/src\/|tests\/)/.test(file);
}

const CLOCK_FILE = "packages/shared/src/clock.ts";

function parse(file: string, content: string): ts.SourceFile {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => {
    walk(child, visit);
  });
}

function moduleSpecifiers(source: ts.SourceFile): { specifier: string; node: ts.Node }[] {
  const found: { specifier: string; node: ts.Node }[] = [];
  walk(source, (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, node });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [first] = node.arguments;
      if (first !== undefined && ts.isStringLiteralLike(first)) found.push({ specifier: first.text, node });
    }
  });
  return found;
}

function checkLayerImports(file: string, source: ts.SourceFile): Violation[] {
  const from = layerOf(file);
  if (from === null || from.module === SHARED_MODULE) return [];
  const violations: Violation[] = [];
  for (const { specifier, node } of moduleSpecifiers(source)) {
    if (specifier === DB_PACKAGE || specifier.startsWith(`${DB_PACKAGE}/`)) {
      if (from.layer !== "infra") violations.push({ rule: "layer-import", file, line: lineOf(source, node), message: `${from.layer}에서 ${DB_PACKAGE}를 가져와요` });
      continue;
    }
    if (!specifier.startsWith(".")) continue;
    const target = layerOf(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    if (target === null || target.module === SHARED_MODULE) continue;
    if (FORBIDDEN_TARGETS[from.layer].includes(target.layer)) {
      violations.push({ rule: "layer-import", file, line: lineOf(source, node), message: `${from.layer}에서 ${target.layer}를 가져와요` });
    }
  }
  return violations;
}

function checkNewDate(file: string, source: ts.SourceFile): Violation[] {
  if (file === CLOCK_FILE) return [];
  const violations: Violation[] = [];
  walk(source, (node) => {
    const isNewDateNow = ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date" && (node.arguments === undefined || node.arguments.length === 0);
    const isDateNow =
      ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Date" && node.expression.name.text === "now";
    if (isNewDateNow || isDateNow) {
      violations.push({ rule: "new-date", file, line: lineOf(source, node), message: "Clock을 주입받지 않았어요" });
    }
  });
  return violations;
}

const REQUEST_PARTS = new Set(["body", "query", "params"]);
const CUSTOMER_KEYS = new Set(["customerId", "userId"]);

/** `X.body`·`X.query`·`X.params` 꼴인지. */
function isRequestPart(node: ts.Node): boolean {
  return ts.isPropertyAccessExpression(node) && REQUEST_PARTS.has(node.name.text);
}

function checkRequestCustomerId(file: string, source: ts.SourceFile): Violation[] {
  if (!file.startsWith("apps/api/src/")) return [];
  const violations: Violation[] = [];
  const report = (node: ts.Node, key: string): void => {
    violations.push({ rule: "request-customer-id", file, line: lineOf(source, node), message: `요청에서 ${key}를 읽어요` });
  };
  walk(source, (node) => {
    if (ts.isPropertyAccessExpression(node) && CUSTOMER_KEYS.has(node.name.text) && isRequestPart(node.expression)) {
      report(node, node.name.text);
    } else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && CUSTOMER_KEYS.has(node.argumentExpression.text) && isRequestPart(node.expression)) {
      report(node, node.argumentExpression.text);
    } else if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer !== undefined && isRequestPart(node.initializer)) {
      for (const element of node.name.elements) {
        const key = element.propertyName ?? element.name;
        if (ts.isIdentifier(key) && CUSTOMER_KEYS.has(key.text)) report(element, key.text);
      }
    }
  });
  return violations;
}

const ASSIGNMENT_OPERATORS = new Set([ts.SyntaxKind.EqualsToken, ts.SyntaxKind.QuestionQuestionEqualsToken, ts.SyntaxKind.BarBarEqualsToken, ts.SyntaxKind.AmpersandAmpersandEqualsToken]);
const UPDATE_STATUS_SQL = /\bUPDATE\s+orders\s+SET\b[^;]*\bstatus\s*=/i;
const TRANSITION_DIR = /^apps\/api\/src\/orders\/domain\//;

function checkStatusAssignment(file: string, source: ts.SourceFile): Violation[] {
  if (!inServerCode(file) || TRANSITION_DIR.test(file)) return [];
  const inInfra = layerOf(file)?.layer === "infra";
  const violations: Violation[] = [];
  walk(source, (node) => {
    if (ts.isBinaryExpression(node) && ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)) {
      const left = node.left;
      const isStatus =
        (ts.isPropertyAccessExpression(left) && left.name.text === "status" && left.expression.kind !== ts.SyntaxKind.ThisKeyword) ||
        (ts.isElementAccessExpression(left) && ts.isStringLiteralLike(left.argumentExpression) && left.argumentExpression.text === "status");
      if (isStatus) violations.push({ rule: "status-assignment", file, line: lineOf(source, node), message: "상태를 직접 바꿨어요" });
    }
    // 저장은 infra repository의 일이다. 그 밖에서 주문 상태를 SQL로 바꾸면 전이 함수를 건너뛴 것이다.
    if (!inInfra && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
      if (UPDATE_STATUS_SQL.test(node.getText(source))) violations.push({ rule: "status-assignment", file, line: lineOf(source, node), message: "SQL로 주문 상태를 바꿨어요" });
    }
  });
  return violations;
}

/** 규칙 1~4: 파일 내용을 보고 위반을 찾는다. 줄 번호는 1부터. */
export function checkContent(file: string, content: string): Violation[] {
  if (!isTypeScript(file)) return [];
  const source = parse(file, content);
  const violations = [...checkLayerImports(file, source), ...checkRequestCustomerId(file, source), ...checkStatusAssignment(file, source)];
  if (inServerCode(file)) violations.push(...checkNewDate(file, source));
  return violations;
}

export function isTestFile(file: string): boolean {
  return /\.test\.(ts|tsx)$/.test(file);
}

export function isMigrationFile(file: string): boolean {
  return /^packages\/db\/migrations\/[^/]+$/.test(file);
}

/** 테스트 파일에서 expect(...) 문이 차지하는 줄 범위(1부터, 양 끝 포함). 여러 줄에 걸친 기대값도 잡는다. */
export function expectLineRanges(file: string, content: string): [number, number][] {
  const source = parse(file, content);
  const ranges: [number, number][] = [];
  walk(source, (node) => {
    if (!ts.isExpressionStatement(node)) return;
    // expect 사슬(expect(a).toBe(b), await expect(p).rejects...)인 문만 센다. it(...) 안의 함수 몸통으로는 들어가지 않는다.
    const hasExpect = (inner: ts.Node): boolean => {
      if (ts.isFunctionLike(inner)) return false;
      if (ts.isCallExpression(inner) && ts.isIdentifier(inner.expression) && inner.expression.text === "expect") return true;
      return ts.forEachChild(inner, hasExpect) ?? false;
    };
    if (hasExpect(node.expression)) {
      ranges.push([lineOf(source, node), source.getLineAndCharacterOfPosition(node.getEnd()).line + 1]);
    }
  });
  return ranges;
}
