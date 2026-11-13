// start.mjs·cleanup.mjs가 함께 쓰는 위치. 실습 설정 폴더는 레포 밖 홈 아래 고정 폴더라
// 브랜치를 바꾸거나 다시 clone해도 실습 로그인이 남고, 원래 ~/.claude와 섞이지 않는다.
import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { StepFailure } from "./report.ts";

export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

export const PRACTICE_CONFIG_DIR_NAME = ".claude-autoever";

/** InstructionsLoaded Hook을 붙이는 관찰용 설정. 프로젝트 .claude/가 아니라 --settings로만 넘긴다(D-23). */
export const OBSERVER_SETTINGS_PATH = path.join(REPO_ROOT, "tools", "observer", "hooks", "settings.json");

/** 링크·junction을 따라간 실제 경로. 아직 없는 경로는 있는 가장 가까운 상위 폴더까지 풀고 나머지를 붙인다. */
function realPath(target: string): string {
  let existing = target;
  const rest: string[] = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  const real = existsSync(existing) ? realpathSync.native(existing) : existing;
  return path.join(real, ...rest);
}

/** inner가 outer와 같거나 그 안에 있는지. Windows는 대소문자를 가리지 않는다. */
function within(inner: string, outer: string): boolean {
  const fold = (p: string): string => (process.platform === "win32" ? p.toLowerCase() : p);
  const relative = path.relative(fold(outer), fold(inner));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * CLAUDE_CONFIG_DIR로 넘길 실습 설정 폴더를 확정한다. claude 실행·폴더 생성·로그아웃·삭제보다 먼저 부른다.
 * 홈(Mac은 HOME, Windows는 USERPROFILE)이 절대 경로가 아니거나, 실제 경로가 원래 설정 폴더 ~/.claude·홈 폴더·레포와
 * 겹치면(같음, 안, 위. 링크·junction 포함) 거부한다. 원래 로그인과 설정을 건드리지 않고 로그인 파일이 레포에 섞이지 않게 하려는 것이다.
 */
export function resolvePracticeConfigDir(home: string = os.homedir()): string {
  if (home === "" || !path.isAbsolute(home)) {
    throw new StepFailure(`홈 폴더 값이 절대 경로가 아닙니다: "${home}". 실습 설정 폴더를 정할 수 없어 아무것도 바꾸지 않았습니다.`, [
      "Mac은 HOME, Windows는 USERPROFILE 환경 변수가 내 홈 폴더 전체 경로인지 확인하고 터미널을 새로 여세요.",
    ]);
  }
  const configDir = path.join(home, PRACTICE_CONFIG_DIR_NAME);
  const real = realPath(configDir);
  const guarded = [
    { target: path.join(home, ".claude"), label: "원래 설정 폴더" },
    { target: REPO_ROOT, label: "레포" },
  ];
  for (const { target, label } of guarded) {
    const realTarget = realPath(target);
    if (within(real, realTarget) || within(realTarget, real)) {
      throw new StepFailure(`실습 설정 폴더 ${configDir}의 실제 위치(${real})가 ${label} ${target}와 겹칩니다. 아무것도 바꾸지 않았습니다.`, [
        `${configDir}가 링크라면 지우고(원래 폴더는 그대로 둡니다) 다시 실행하세요.`,
      ]);
    }
  }
  // 홈 폴더 자체나 그 위면 원래 ~/.claude.json과 겹친다.
  if (within(realPath(home), real)) {
    throw new StepFailure(`실습 설정 폴더 ${configDir}의 실제 위치(${real})가 홈 폴더와 같거나 그 위입니다. 아무것도 바꾸지 않았습니다.`, [
      `${configDir}가 링크라면 지우고 다시 실행하세요.`,
    ]);
  }
  return configDir;
}

/** 실습 설정 폴더로 claude를 부를 때의 환경 변수. claude를 부르는 모든 곳이 이것을 쓴다. */
export function claudeEnv(configDir: string): NodeJS.ProcessEnv {
  return { ...process.env, CLAUDE_CONFIG_DIR: configDir };
}
