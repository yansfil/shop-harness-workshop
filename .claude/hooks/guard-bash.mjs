// PreToolUse Hook(Bash): force push와 대량 삭제를 실행 전에 막는다.
// 명령은 bash-command.mjs가 펼친다: `env`·`sudo --user x`·`VAR=값` 접두어, `git -C dir`·`git --work-tree x` 같은 전역 옵션,
// `;`·`&&`·`|`로 이은 명령, 서브셸, `bash -c`·`eval` 안까지 본다. 판정 범위와 알려진 한계는 README.md에 있다.
import path from "node:path";
import { commandName, gitSubcommand, simpleCommands, toSlash } from "./bash-command.mjs";
import { denyTool, emit, isMain, readPayload } from "./hook-io.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");

// 지워도 되는 빌드 산출물 폴더. 재귀 삭제는 이 폴더들에만 허용한다.
const DISPOSABLE = new Set(["node_modules", "dist", "coverage", ".vite", "build"]);

function isForcePush(argv) {
  const git = gitSubcommand(argv);
  if (git?.name !== "push") return false;
  return git.args.some(
    (token) =>
      /^--(force|force-with-lease|force-if-includes|mirror|delete)(=.*)?$/.test(token) ||
      /^-[a-zA-Z]*f[a-zA-Z]*$/.test(token) ||
      /^\+\S/.test(token),
  );
}

function baseName(target) {
  return toSlash(target).replace(/\/+$/, "").split("/").pop() ?? "";
}

function isMassDelete(argv) {
  const [first, ...rest] = argv;
  const name = commandName(first);
  const flags = rest.filter((token) => token.startsWith("-"));
  const targets = rest.filter((token) => !token.startsWith("-"));
  if (["rm", "rd", "rmdir", "del", "rimraf"].includes(name)) {
    const recursive =
      name === "rimraf" || flags.some((flag) => /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(flag) || flag === "--recursive") || rest.some((token) => /^\/s$/i.test(token));
    if (!recursive) return false;
    const paths = targets.filter((token) => !/^\/[a-z]$/i.test(token));
    return paths.length === 0 || paths.some((target) => /[*?]/.test(target) || !DISPOSABLE.has(baseName(target)));
  }
  const git = gitSubcommand(argv);
  if (git?.name === "clean") return git.args.some((arg) => /^-[a-zA-Z]*f/.test(arg) || arg === "--force");
  if (name === "find") return rest.includes("-delete");
  if (name === "Remove-Item") return rest.some((token) => /^-Recurse$/i.test(token));
  return false;
}

export function decide(payload) {
  if (payload.tool_name !== "Bash") return null;
  for (const { argv } of simpleCommands(String(payload.tool_input?.command ?? ""), payload.cwd ?? root)) {
    if (isForcePush(argv)) {
      return denyTool("force push는 막혀 있습니다. 원격 기록을 덮어쓰지 말고, 충돌은 `git merge`로 풀고 일반 `git push`를 쓰세요. 꼭 필요하면 사람에게 요청하세요.");
    }
    if (isMassDelete(argv)) {
      return denyTool("대량 삭제는 막혀 있습니다. 재귀 삭제(`rm -r`, `git clean -f`, `find -delete` 등)는 node_modules·dist·coverage 같은 빌드 산출물에만 허용됩니다. 지울 파일을 하나씩 지정하거나 사람에게 확인받으세요.");
    }
  }
  return null;
}

if (isMain(import.meta.url)) emit(decide(await readPayload()));
