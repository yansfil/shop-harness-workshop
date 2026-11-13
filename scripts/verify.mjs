// npm run verify: Node 24 확인 → 타입 검사 → lint → 테스트 → 빌드.
// 도구를 셸이나 npm을 거치지 않고 현재 node(process.execPath)로 직접 실행하므로 Mac·Windows·Linux에서 같게 돈다.
// 실패하면 단계 이름을 보이고 0이 아닌 코드로 멈춘다.
// `--only <단계 키>`로 한 단계만 돌릴 수 있다(npm run typecheck·lint·build가 쓴다).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const webDir = path.join(root, "apps", "web");

function binOf(fromDir, pkg, relativeBin) {
  const require = createRequire(path.join(fromDir, "package.json"));
  return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), relativeBin);
}

function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major !== 24) {
    console.error(`Node 24가 필요합니다. 지금은 ${process.version}입니다. https://nodejs.org/ko/download 에서 24 LTS를 설치하세요.`);
    return 1;
  }
  console.log(`Node ${process.version}`);
  return 0;
}

function typecheck() {
  const tsc = binOf(root, "typescript", "bin/tsc");
  for (const project of ["tsconfig.json", path.join("apps", "web", "tsconfig.json")]) {
    console.log(`tsc -p ${project}`);
    const code = run([tsc, "-p", project]);
    if (code !== 0) return code;
  }
  return 0;
}

const steps = [
  { key: "node", name: "Node 24 확인", run: checkNode },
  { key: "typecheck", name: "타입 검사", run: typecheck },
  { key: "lint", name: "lint", run: () => run([binOf(root, "eslint", "bin/eslint.js"), ".", "--max-warnings", "0"]) },
  { key: "test", name: "테스트", run: () => run([binOf(root, "vitest", "vitest.mjs"), "run"]) },
  { key: "build", name: "빌드", run: () => run([binOf(webDir, "vite", "bin/vite.js"), "build"], webDir) },
];

const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex === -1 ? null : process.argv[onlyIndex + 1];
const selected = only === null ? steps : steps.filter((step) => step.key === only);
if (selected.length === 0) {
  console.error(`알 수 없는 단계입니다: ${only}. 가능한 값: ${steps.map((step) => step.key).join(", ")}`);
  process.exit(2);
}

for (const [index, step] of selected.entries()) {
  console.log(`\n[verify ${index + 1}/${selected.length}] ${step.name}`);
  const code = step.run();
  if (code !== 0) {
    console.error(`\n[verify] 실패: "${step.name}" 단계 (종료 코드 ${code})`);
    process.exit(code);
  }
}
console.log(`\n[verify] 통과: ${selected.map((step) => step.name).join(" → ")}`);
