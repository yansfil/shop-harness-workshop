// npm run grade: 시작 태그 이후 바뀐 코드에서 규칙 6개 위반을 찾는다.
//   npm run grade              시작 태그(start/<브랜치>) 이후 바뀐 것
//   npm run grade -- --all     레포 전체
//   npm run grade -- --json    결과를 JSON으로
// 종료 코드: 0 통과, 1 위반 있음, 2 채점할 수 없음(태그 없음 등).
import path from "node:path";
import { GradeError } from "./git.ts";
import { gradeAll, gradeSinceStart, type GradeResult } from "./grade.ts";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const args = new Set(process.argv.slice(2));
const unknown = [...args].filter((arg) => arg !== "--all" && arg !== "--json");
if (unknown.length > 0) {
  console.error(`알 수 없는 옵션: ${unknown.join(" ")}. 쓸 수 있는 옵션: --all, --json`);
  process.exit(2);
}

/** 터미널에서 한글은 두 칸을 차지하므로 칸 수로 맞춘다. */
function padCells(text: string, cells: number): string {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1;
  return text + " ".repeat(Math.max(1, cells - width));
}

function print(result: GradeResult): void {
  const scope = result.mode === "all" ? `레포 전체 · 파일 ${result.filesChecked}개 검사` : `${result.tag ?? ""} 이후 바뀐 파일 ${result.filesChecked}개`;
  console.log(`채점 범위: ${scope}\n`);
  for (const rule of result.rules) {
    const mark = rule.count === null ? "해당 없음" : rule.count === 0 ? "통과" : `위반 ${rule.count}개`;
    console.log(`  ${padCells(rule.title, 26)}${mark}`);
  }
  if (result.violations.length > 0) {
    console.log("");
    for (const violation of result.violations) {
      const title = result.rules.find((rule) => rule.id === violation.rule)?.title ?? violation.rule;
      console.log(`  [${title}] ${violation.file}:${violation.line}  ${violation.message}`);
    }
  }
  console.log(result.violations.length === 0 ? "\n통과: 규칙 6개를 모두 지켰어요" : `\n위반 ${result.violations.length}개`);
}

try {
  const result = args.has("--all") ? gradeAll(root) : gradeSinceStart(root);
  if (args.has("--json")) console.log(JSON.stringify(result, null, 2));
  else print(result);
  process.exit(result.violations.length === 0 ? 0 : 1);
} catch (error) {
  if (!(error instanceof GradeError)) throw error;
  console.error(`채점할 수 없어요: ${error.message}`);
  process.exit(2);
}
