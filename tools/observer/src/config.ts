// 관찰 도구의 환경 변수 계약은 여기 한 곳에만 있다. 다른 파일은 process.env를 읽지 않는다.
import { realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const REPO_ROOT = realpathSync(path.resolve(import.meta.dirname, "..", "..", ".."));

export const OBSERVER_ENV = {
  CLAUDE_CONFIG_DIR: {
    fallback: "~/.claude-autoever",
    note: "실습 설정 폴더. start.mjs가 같은 값으로 Claude Code를 띄운다. 비우면 ~/.claude-autoever",
  },
} as const;

export interface ObserverPaths {
  configDir: string;
  /** 이 레포에서 시작한 세션 기록이 쌓이는 폴더. */
  projectDir: string;
  /** InstructionsLoaded Hook 기록 폴더. */
  instructionsDir: string;
}

/** Claude Code가 이 길이를 넘는 폴더 이름은 잘라서 해시를 붙인다. 그 해시는 여기서 같게 만들 수 없다. */
const MAX_SLUG_LENGTH = 200;

/** Claude Code가 프로젝트 폴더 이름을 바꾸는 규칙: 영문·숫자가 아닌 글자는 모두 '-'. */
export function projectSlug(projectRoot: string): string {
  const slug = projectRoot.replace(/[^a-zA-Z0-9]/g, "-");
  if (slug.length > MAX_SLUG_LENGTH) {
    throw new Error(`레포 경로가 너무 길어(${projectRoot.length}자) 세션 기록 폴더를 찾을 수 없어요. 레포를 더 짧은 경로로 옮기세요.`);
  }
  return slug;
}

export function resolvePaths(env: Record<string, string | undefined> = process.env, repoRoot: string = REPO_ROOT): ObserverPaths {
  const raw = env.CLAUDE_CONFIG_DIR;
  const configDir = raw === undefined || raw === "" ? path.join(os.homedir(), ".claude-autoever") : path.resolve(raw);
  return {
    configDir,
    projectDir: path.join(configDir, "projects", projectSlug(repoRoot)),
    instructionsDir: path.join(configDir, "observer", "instructions"),
  };
}
