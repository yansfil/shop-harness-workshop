// PreToolUse Hook(Bash): force push와 대량 삭제를 실행 전에 막는다.
import { denyTool, emit, isMain, readPayload } from "./hook-io.mjs";

// 지워도 되는 빌드 산출물 폴더. 재귀 삭제는 이 폴더들에만 허용한다.
const DISPOSABLE = new Set(["node_modules", "dist", "coverage", ".vite", "build"]);

function splitCommands(command) {
  return command.split(/&&|\|\||;|\||\n/).map((part) => part.trim()).filter((part) => part !== "");
}

function tokensOf(segment) {
  return segment.split(/\s+/).map((token) => token.replace(/^["']|["']$/g, "")).filter((token) => token !== "");
}

/** `git -C dir push ...`처럼 앞에 옵션이 붙어도 git의 하위 명령과 그 뒤 인자를 찾는다. */
function gitSubcommand(tokens) {
  if (tokens[0] !== "git") return null;
  let index = 1;
  while (index < tokens.length && tokens[index].startsWith("-")) index += tokens[index] === "-C" || tokens[index] === "-c" ? 2 : 1;
  return index < tokens.length ? { name: tokens[index], args: tokens.slice(index + 1) } : null;
}

function isForcePush(tokens) {
  const git = gitSubcommand(tokens);
  if (git?.name !== "push") return false;
  return git.args.some(
    (token) =>
      /^--(force|force-with-lease|force-if-includes|mirror|delete)(=.*)?$/.test(token) ||
      /^-[a-zA-Z]*f[a-zA-Z]*$/.test(token) ||
      /^\+\S/.test(token),
  );
}

function baseName(target) {
  return target.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? "";
}

function isMassDelete(tokens) {
  const [name, ...rest] = tokens;
  const flags = rest.filter((token) => token.startsWith("-"));
  const targets = rest.filter((token) => !token.startsWith("-"));
  if (name === "rm" || name === "rd" || name === "rmdir" || name === "del") {
    const recursive = flags.some((flag) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(flag) || flag === "--recursive" || /^\/s$/i.test(flag));
    const windowsRecursive = rest.some((token) => /^\/s$/i.test(token));
    if (!recursive && !windowsRecursive) return false;
    const paths = targets.filter((token) => !/^\/[a-z]$/i.test(token));
    return paths.length === 0 || paths.some((target) => /[*?]/.test(target) || !DISPOSABLE.has(baseName(target)));
  }
  const git = gitSubcommand(tokens);
  if (git?.name === "clean") return git.args.some((arg) => /^-[a-zA-Z]*f/.test(arg) || arg === "--force");
  if (name === "find") return rest.includes("-delete");
  if (name === "Remove-Item") return rest.some((token) => /^-Recurse$/i.test(token));
  return false;
}

export function decide(payload) {
  if (payload.tool_name !== "Bash") return null;
  const command = String(payload.tool_input?.command ?? "");
  for (const segment of splitCommands(command)) {
    const tokens = tokensOf(segment);
    if (isForcePush(tokens)) {
      return denyTool("force push는 막혀 있습니다. 원격 기록을 덮어쓰지 말고, 충돌은 `git merge`로 풀고 일반 `git push`를 쓰세요. 꼭 필요하면 사람에게 요청하세요.");
    }
    if (isMassDelete(tokens)) {
      return denyTool("대량 삭제는 막혀 있습니다. 재귀 삭제(`rm -r`, `git clean -f`, `find -delete` 등)는 node_modules·dist·coverage 같은 빌드 산출물에만 허용됩니다. 지울 파일을 하나씩 지정하거나 사람에게 확인받으세요.");
    }
  }
  return null;
}

if (isMain(import.meta.url)) emit(decide(await readPayload()));
