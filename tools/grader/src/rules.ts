// 채점 규칙 6개. 모두 결정적이고 모델을 부르지 않는다.
// 1~4는 파일 내용을 TypeScript 구문 트리로 읽어 검사하고, 5·6은 시작 태그와의 차이(diff)로 검사한다.
// 규칙의 설명과 예시는 docs/rules/와 docs/architecture.md에 있다.
import path from "node:path";
import { OrderStatusSchema } from "@grabmarket/contracts";
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

/** 위반과, 그 위반을 낸 문장(구문 노드)의 토큰. 시작 태그 때의 같은 문장과 맞춰 보는 데 쓴다. */
export interface Finding {
  violation: Violation;
  statement: string;
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

/** 노드의 토큰을 공백 하나로 이어 붙인 것. 줄바꿈·들여쓰기·주석만 바뀐 문장은 같은 값이 된다. */
function statementTokens(source: ts.SourceFile, node: ts.Node): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, source.languageVariant, node.getText(source));
  const tokens: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) tokens.push(scanner.getTokenText());
  return tokens.join(" ");
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

function finding(source: ts.SourceFile, node: ts.Node, rule: RuleId, message: string): Finding {
  return { violation: { rule, file: source.fileName, line: lineOf(source, node), message }, statement: statementTokens(source, node) };
}

function checkLayerImports(file: string, source: ts.SourceFile): Finding[] {
  const from = layerOf(file);
  if (from === null || from.module === SHARED_MODULE) return [];
  const violations: Finding[] = [];
  for (const { specifier, node } of moduleSpecifiers(source)) {
    if (specifier === DB_PACKAGE || specifier.startsWith(`${DB_PACKAGE}/`)) {
      if (from.layer !== "infra") violations.push(finding(source, node, "layer-import", `${from.layer}에서 ${DB_PACKAGE}를 가져와요`));
      continue;
    }
    if (!specifier.startsWith(".")) continue;
    const target = layerOf(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    if (target === null || target.module === SHARED_MODULE) continue;
    if (FORBIDDEN_TARGETS[from.layer].includes(target.layer)) {
      violations.push(finding(source, node, "layer-import", `${from.layer}에서 ${target.layer}를 가져와요`));
    }
  }
  return violations;
}

function checkNewDate(file: string, source: ts.SourceFile): Finding[] {
  if (file === CLOCK_FILE) return [];
  const violations: Finding[] = [];
  walk(source, (node) => {
    const isNewDateNow = ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date" && (node.arguments === undefined || node.arguments.length === 0);
    const isDateNow =
      ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "Date" && node.expression.name.text === "now";
    if (isNewDateNow || isDateNow) {
      violations.push(finding(source, node, "new-date", "Clock을 주입받지 않았어요"));
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

function checkRequestCustomerId(file: string, source: ts.SourceFile): Finding[] {
  if (!file.startsWith("apps/api/src/")) return [];
  const violations: Finding[] = [];
  const report = (node: ts.Node, key: string): void => {
    violations.push(finding(source, node, "request-customer-id", `요청에서 ${key}를 읽어요`));
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
const ORDER_STATUSES: ReadonlySet<string> = new Set(OrderStatusSchema.options);
const ORDERS_MODULE = /^apps\/api\/src\/orders\//;
const ORDERS_DOMAIN = /^apps\/api\/src\/orders\/domain\//;
/** 주문 상태를 바꿀 수 있는 단 하나의 함수(docs/rules/03). */
const TRANSITION_FUNCTION = "transitionStatus";
const ORDER_NAME = /order/i;

/** `X.status` 또는 `X["status"]`면 X, 아니면 null. */
function statusReceiver(node: ts.Expression): ts.Expression | null {
  if (ts.isPropertyAccessExpression(node) && node.name.text === "status") return node.expression;
  if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === "status") return node.expression;
  return null;
}

/** node를 감싼 함수·메서드의 이름(안쪽부터). */
function enclosingFunctionNames(node: ts.Node): string[] {
  const names: string[] = [];
  // 소스 파일 노드의 parent는 실행 중에는 undefined다(타입 선언은 늘 있다고 적는다).
  for (let current = node.parent as ts.Node | undefined; current !== undefined; current = current.parent as ts.Node | undefined) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name !== undefined) names.push(current.name.getText());
    else if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent)) names.push(current.parent.name.getText());
  }
  return names;
}

/**
 * 대입되는 status가 주문 상태인지. 타입 정보 없이 구문만 보므로 다음 중 하나면 주문 상태로 본다.
 * orders 모듈 안의 코드(주문 엔터티의 this.status 포함), 이름에 order가 든 대상(order.status), 주문 상태 값(paid 등)을 넣는 대입.
 */
function isOrderStatus(file: string, receiver: ts.Expression, value: ts.Expression): boolean {
  if (ORDERS_MODULE.test(file)) return true;
  if (receiver.kind !== ts.SyntaxKind.ThisKeyword && ORDER_NAME.test(receiver.getText())) return true;
  return ts.isStringLiteralLike(value) && ORDER_STATUSES.has(value.text);
}

function checkStatusAssignment(file: string, source: ts.SourceFile): Finding[] {
  if (!inServerCode(file)) return [];
  const inInfra = layerOf(file)?.layer === "infra";
  const inDomain = ORDERS_DOMAIN.test(file);
  const violations: Finding[] = [];
  walk(source, (node) => {
    if (ts.isBinaryExpression(node) && ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)) {
      const receiver = statusReceiver(node.left);
      if (receiver !== null) {
        const inTransition = inDomain && enclosingFunctionNames(node).includes(TRANSITION_FUNCTION);
        if (!inTransition && isOrderStatus(file, receiver, node.right)) violations.push(finding(source, node, "status-assignment", "주문 상태를 전이 함수 밖에서 바꿨어요"));
      }
    }
    // 저장은 infra repository의 일이다. 그 밖에서 주문 상태를 SQL로 바꾸면 전이 함수를 건너뛴 것이다.
    if (!inInfra && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))) {
      if (UPDATE_STATUS_SQL.test(node.getText(source))) violations.push(finding(source, node, "status-assignment", "SQL로 주문 상태를 바꿨어요"));
    }
  });
  return violations;
}

/** 규칙 1~4: 파일 내용을 보고 위반을 찾는다. 줄 번호는 위반을 낸 문장의 첫 줄(1부터). */
export function findViolations(file: string, content: string): Finding[] {
  if (!isTypeScript(file)) return [];
  const source = parse(file, content);
  const findings = [...checkLayerImports(file, source), ...checkRequestCustomerId(file, source), ...checkStatusAssignment(file, source)];
  if (inServerCode(file)) findings.push(...checkNewDate(file, source));
  return findings;
}

export function isTestFile(file: string): boolean {
  return /\.test\.(ts|tsx)$/.test(file);
}

export function isMigrationFile(file: string): boolean {
  return /^packages\/db\/migrations\/[^/]+$/.test(file);
}

/** 기대 하나: vitest의 expect(...)부터 매처 사슬 끝까지, 또는 Supertest 체인의 .expect(...) 호출과 인자. */
export interface Expectation {
  /** 기대가 시작하는 줄(1부터). */
  line: number;
  /** 파일 안 위치. 같은 줄의 기대끼리 순서를 정한다. */
  position: number;
  /** 토큰으로 정규화한 기대. 줄바꿈·들여쓰기·주석만 바뀌면 같다. */
  text: string;
}

/** 테스트 케이스(describe·it 제목 경로)마다 그 안의 기대를 나온 순서대로. */
export interface TestCase {
  title: string;
  expectations: Expectation[];
}

const SUITE_FUNCTIONS = new Set(["describe", "it", "test"]);
const CASE_FUNCTIONS = new Set(["it", "test"]);
/** 테스트 케이스 밖(파일 위의 도우미 함수, beforeEach 등)의 기대가 들어가는 이름. */
const OUTSIDE_CASES = "(테스트 케이스 밖)";

/** describe(...)·it.only(...)·test.skip(...) 같은 호출이면 그 이름(describe·it·test). */
function suiteFunction(node: ts.CallExpression): string | null {
  const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.expression : node.expression;
  return ts.isIdentifier(callee) && SUITE_FUNCTIONS.has(callee.text) ? callee.text : null;
}

/** vitest 기대의 끝: expect(a)에서 .not.toBe(b)처럼 이어지는 사슬의 맨 바깥 노드. */
function chainEnd(node: ts.Node): ts.Node {
  let current = node;
  while ((ts.isPropertyAccessExpression(current.parent) || ts.isCallExpression(current.parent)) && current.parent.expression === current) current = current.parent;
  return current;
}

/**
 * 테스트 파일의 테스트 케이스와 그 기대들. 같은 제목 경로가 또 나오면 뒤에 (2), (3)을 붙인다.
 * 기대 식만 비교하므로 응답 변수 이름처럼 기대 밖의 코드가 바뀌어도 같고, 다른 테스트의 같은 기대와는 섞이지 않는다.
 */
export function testCases(file: string, content: string): TestCase[] {
  const source = parse(file, content);
  const cases = new Map<string, TestCase>();
  const caseFor = (title: string): TestCase => {
    let found = cases.get(title);
    if (found === undefined) {
      found = { title, expectations: [] };
      cases.set(title, found);
    }
    return found;
  };
  const visit = (node: ts.Node, path: readonly string[], inCase: boolean): void => {
    if (ts.isCallExpression(node)) {
      const suite = suiteFunction(node);
      const [titleNode, ...rest] = node.arguments;
      if (suite !== null && titleNode !== undefined) {
        const isCase = CASE_FUNCTIONS.has(suite);
        const name = ts.isStringLiteralLike(titleNode) ? titleNode.text : statementTokens(source, titleNode);
        let segment = name;
        for (let count = 2; isCase && cases.has([...path, segment].join(" › ")); count += 1) segment = `${name} (${String(count)})`;
        if (isCase) caseFor([...path, segment].join(" › "));
        for (const argument of rest) visit(argument, [...path, segment], inCase || isCase);
        return;
      }
      const callee = node.expression;
      const owner = inCase ? path.join(" › ") : [...path, OUTSIDE_CASES].join(" › ");
      if (ts.isIdentifier(callee) && callee.text === "expect") {
        caseFor(owner).expectations.push({ line: lineOf(source, node), position: node.getStart(source), text: statementTokens(source, chainEnd(node)) });
      } else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "expect") {
        const args = node.arguments.map((argument) => statementTokens(source, argument)).join(" , ");
        caseFor(owner).expectations.push({ line: lineOf(source, callee.name), position: callee.name.getStart(source), text: `. expect ( ${args} )` });
      }
    }
    ts.forEachChild(node, (child) => {
      visit(child, path, inCase);
    });
  };
  visit(source, [], false);
  for (const testCase of cases.values()) testCase.expectations.sort((a, b) => a.position - b.position);
  return [...cases.values()];
}
