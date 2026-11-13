// 강의 뒤 정리: node cleanup.mjs
// 지울 것(실습 설정 폴더 ~/.claude-autoever, 세션 수, 실습 worktree) 미리 보기 → 기록 HTML 내보내기(선택) → y/N
// → y일 때만 실습 설정 폴더 쪽 로그아웃 → 실습 worktree·설정 폴더 삭제. N이면 아무것도 지우지 않는다.
// 원래 ~/.claude와 레포 본 checkout은 건드리지 않는다.
import { checkNode } from "./tools/launcher/node-check.mjs";

if (!checkNode("cleanup.mjs", 6)) process.exit(1);

import("./tools/launcher/src/cleanup.ts")
  .then((launcher) => launcher.runCleanup())
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("cleanup.mjs: 예상하지 못한 오류로 멈췄습니다.", error);
    process.exit(1);
  });
