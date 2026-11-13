// 작업 트리 지문: 지금 작업 트리의 내용을 git 트리 id 하나로 만든다.
// .gitignore로 빠지는 파일과 문서(*.md)는 넣지 않는다. 커밋했는지와 관계없이 내용이 같으면 같은 id가 나온다.
// npm run verify가 전체 통과할 때 이 id를 찍고, Stop Hook(.claude/hooks/stop-verify.mjs)이 지금 id와 비교한다.
// 실제 인덱스는 건드리지 않는다. 복사본 인덱스(GIT_INDEX_FILE)에 모아 write-tree 한다.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync, utimesSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function git(cwd, args, env = {}) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} 실패: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

export function worktreeId(root) {
  const realIndex = path.resolve(root, git(root, ["rev-parse", "--git-path", "index"]));
  const temp = mkdtempSync(path.join(os.tmpdir(), "worktree-id-"));
  try {
    const env = { GIT_INDEX_FILE: path.join(temp, "index") };
    // 실제 인덱스를 복사해 두면 바뀌지 않은 파일은 다시 해시하지 않는다.
    if (existsSync(realIndex)) {
      copyFileSync(realIndex, env.GIT_INDEX_FILE);
      // 복사본의 mtime을 원본에 맞춘다. 새 mtime이면 git의 racy 판정이 달라져, 같은 초에 같은 크기로 바뀐 파일을 옛 해시로 남긴다.
      const { atime, mtime } = statSync(realIndex);
      utimesSync(env.GIT_INDEX_FILE, atime, mtime);
    }
    git(root, ["add", "--all", "--", ".", ":(exclude)*.md"], env);
    git(root, ["rm", "-r", "-q", "--cached", "--ignore-unmatch", "--", "*.md"], env);
    return git(root, ["write-tree"], env);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
