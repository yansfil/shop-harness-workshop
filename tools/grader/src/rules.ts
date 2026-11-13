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

export interface ExpectStatement {
  /** 문장의 첫 줄(1부터). */
  line: number;
  statement: string;
}

/** 기대를 적는 호출: vitest의 expect(...)와 Supertest 체인의 .expect(...). */
function isExpectCall(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  return (ts.isIdentifier(callee) && callee.text === "expect") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "expect");
}

/**
 * 테스트 파일에서 기대 호출이 든 문장. expect(a).toBe(b), await expect(p).rejects...,
 * const response = await request(app).post(...).expect(201) 처럼 여러 줄에 걸친 문장 전체를 하나로 본다.
 */
export function expectStatements(file: string, content: string): ExpectStatement[] {
  const source = parse(file, content);
  const found: ExpectStatement[] = [];
  // it(...) 안의 함수 몸통으로는 들어가지 않는다. 그 안의 문장은 따로 하나씩 센다.
  const hasExpect = (inner: ts.Node): boolean => !ts.isFunctionLike(inner) && (isExpectCall(inner) || (ts.forEachChild(inner, hasExpect) ?? false));
  walk(source, (node) => {
    if (!(ts.isExpressionStatement(node) || ts.isVariableStatement(node) || ts.isReturnStatement(node))) return;
    if (ts.forEachChild(node, hasExpect) ?? false) found.push({ line: lineOf(source, node), statement: statementTokens(source, node) });
  });
  return found;
}
