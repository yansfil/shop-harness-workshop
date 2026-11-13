// Stop Hook: 이 세션이 코드를 바꿨는데, 지금 작업 트리가 마지막으로 전체 `npm run verify`를 통과한 작업 트리와 다르면 끝내기를 막는다.
//
// - "코드를 바꿨다": Write·Edit 등으로 문서(.md)가 아닌 파일을 고쳤거나, 읽기 전용이 아닌 Bash 명령을 돌렸다(bash-command.mjs가 판정).
// - "전체 verify 통과": verify를 부른 Bash 결과에 `[verify] 전체 통과 · 작업 트리 <id>`가 있다.
//   scripts/verify.mjs는 `--only` 없이 다섯 단계를 모두 통과했을 때만 이 줄을 찍는다.
// - 작업 트리 비교: scripts/worktree-id.mjs의 지문(내용 기준 git 트리 id). Bash로 고친 것도, 커밋한 것도 내용으로 비교한다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { worktreeId } from "../../scripts/worktree-id.mjs";
import { changesFiles, commandName, simpleCommands } from "./bash-command.mjs";
import { emit, isMain, readPayload } from "./hook-io.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const FULL_PASS = /^\[verify\] 전체 통과 · 작업 트리 ([0-9a-f]{40,64})\s*$/m;

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n");
  return "";
}

function isVerifyRun({ argv }) {
  const name = commandName(argv[0]);
  if (name === "npm") return (argv[1] === "run" || argv[1] === "run-script") && argv[2] === "verify";
  return name === "node" && argv.slice(1).some((word) => /(^|[\\/])scripts[\\/]verify\.mjs$/.test(word));
}

/** 세션 기록에서 코드를 바꿨는지와, 마지막 전체 verify 통과 때의 작업 트리 id를 읽는다. */
export function verifyStatus(transcriptText) {
  let touched = false;
  let passedTree = null;
  const verifyCalls = new Set();
  for (const line of transcriptText.split("\n")) {
    if (line.trim() === "") continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "tool_use") {
        const input = part.input ?? {};
        if (EDIT_TOOLS.has(part.name)) {
          if (!String(input.file_path ?? input.notebook_path ?? "").endsWith(".md")) touched = true;
        } else if (part.name === "Bash") {
          const commands = simpleCommands(String(input.command ?? ""), root);
          if (commands.some(changesFiles)) touched = true;
          if (commands.some(isVerifyRun)) verifyCalls.add(part.id);
        }
      } else if (part?.type === "tool_result" && verifyCalls.has(part.tool_use_id) && part.is_error !== true) {
        const match = FULL_PASS.exec(textOf(part.content));
        if (match !== null) passedTree = match[1];
      }
    }
  }
  return { touched, passedTree };
}

const HOW_TO =
  "끝내기 전에 `npm run verify`를 실행해 다섯 단계 전체 통과를 확인하세요(`--only`로 일부만 돌린 것은 치지 않습니다). 실패하면 원인을 고친 뒤 다시 실행하고, 기존 테스트의 기대값을 바꿔서 통과시키지 마세요.";

function stopOrWarn(payload, why) {
  if (payload.stop_hook_active === true) {
    return {
      systemMessage: `${why} verify 확인 없이 끝났습니다. 이미 한 번 막았기 때문에 더 막지 않습니다(계속 막으면 끝내기가 끝없이 반복됩니다).`,
    };
  }
  return { decision: "block", reason: `${why} ${HOW_TO}` };
}

export function decide(payload, readTranscript, currentTree) {
  let status;
  try {
    status = verifyStatus(readTranscript(payload.transcript_path));
  } catch (error) {
    return stopOrWarn(payload, `세션 기록을 읽지 못했습니다(${error.message}).`);
  }
  if (!status.touched) return null;
  let tree;
  try {
    tree = currentTree();
  } catch (error) {
    return stopOrWarn(payload, `작업 트리 지문을 만들지 못했습니다(${error.message}).`);
  }
  if (status.passedTree === tree) return null;
  const why =
    status.passedTree === null
      ? "코드를 바꿨는데 이 세션에서 전체 통과한 `npm run verify`가 없습니다."
      : "마지막으로 전체 통과한 `npm run verify` 뒤에 코드가 바뀌었습니다.";
  return stopOrWarn(payload, why);
}

if (isMain(import.meta.url)) {
  emit(decide(await readPayload(), (file) => readFileSync(file, "utf8"), () => worktreeId(root)));
}
