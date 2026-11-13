// start.mjs·cleanup.mjs가 함께 쓰는 위치. 실습 설정 폴더는 레포 밖 홈 아래 고정 폴더라
// 브랜치를 바꾸거나 다시 clone해도 실습 로그인이 남고, 원래 ~/.claude와 섞이지 않는다.
import os from "node:os";
import path from "node:path";

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

export const PRACTICE_CONFIG_DIR_NAME = ".claude-autoever";

/** CLAUDE_CONFIG_DIR로 넘길 실습 설정 폴더. os.homedir()는 Mac에서 HOME, Windows에서 USERPROFILE을 따른다. */
export function practiceConfigDir(): string {
  return path.join(os.homedir(), PRACTICE_CONFIG_DIR_NAME);
}

/** InstructionsLoaded Hook을 붙이는 관찰용 설정. 프로젝트 .claude/가 아니라 --settings로만 넘긴다(D-23). */
export const OBSERVER_SETTINGS_PATH = path.join(REPO_ROOT, "tools", "observer", "hooks", "settings.json");
