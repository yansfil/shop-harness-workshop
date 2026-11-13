// start.mjs·cleanup.mjs가 가장 먼저 부르는 Node 버전 확인.
// Node 24가 아닌 Node에서도 돌아야 하므로 새 문법(import.meta.dirname 등)·TypeScript·의존성 없이 쓴다.
// 줄 모양은 tools/launcher/src/report.ts와 같다.

export const NODE_INSTALL_HELP = [
  "설치: https://nodejs.org/ko/download 에서 Node 24 LTS를 받으세요.",
  "nvm·fnm을 쓰면 레포의 .nvmrc대로 `nvm use 24` 또는 `fnm use 24`를 먼저 하세요.",
  "Windows에서 관리자 권한이 없으면: 같은 페이지에서 Windows 바이너리 .zip(x64)을 받아 C:\\Users\\<이름>\\node24 같은 곳에 풀고, " +
    "'계정의 환경 변수 편집'에서 그 폴더를 사용자 Path 맨 위에 넣은 뒤 터미널을 새로 여세요.",
];

/**
 * Node 24인지 확인하고 결과 줄을 찍는다. 통과하면 true.
 * @param {string} script 멈춘 스크립트 이름(start.mjs·cleanup.mjs)
 * @param {number} total 전체 단계 수
 */
export function checkNode(script, total) {
  const name = "Node 24 확인";
  const major = Number(process.versions.node.split(".")[0]);
  if (major === 24) {
    console.log(`[1/${total}] ${name}: 통과 (${process.version})`);
    return true;
  }
  console.error(`[1/${total}] ${name}: 실패`);
  console.error(`  이유: Node 24가 필요합니다. 지금은 ${process.version}입니다.`);
  for (const line of NODE_INSTALL_HELP) console.error(`  ${line}`);
  console.error(`\n${script}가 "${name}" 단계에서 멈췄습니다.`);
  return false;
}
