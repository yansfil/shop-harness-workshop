// 실습 시작: node start.mjs [--check] [claude에 넘길 옵션...]
// Node 24 확인 → 실습 설정 폴더 위치 → claude 명령 → 의존성 → DB → 실습 설정 폴더(~/.claude-autoever)·.env·관찰 Hook → claude 실행.
// --check는 claude를 띄우지 않고 실행 전 단계까지만 한다. 원래 ~/.claude는 건드리지 않는다.
// 이 파일은 Node 24가 아닌 Node에서도 돌아 "Node 24 확인" 실패를 보여야 하므로, Node를 확인한 뒤에만 TypeScript 모듈을 불러온다.
import { checkNode } from "./tools/launcher/node-check.mjs";

if (!checkNode("start.mjs", 7)) process.exit(1);

import("./tools/launcher/src/start.ts")
  .then((launcher) => launcher.runStart(process.argv.slice(2)))
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("start.mjs: 예상하지 못한 오류로 멈췄습니다.", error);
    process.exit(1);
  });
