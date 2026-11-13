// Stop Hook: 파일을 고쳤는데 그 뒤에 `npm run verify`가 통과한 적이 없으면 끝내기를 막는다.
// 세션 기록(transcript)에서 "마지막 코드 수정"과 "마지막 verify 통과"의 순서를 비교한다.
import { readFileSync } from "node:fs";
import { emit, isMain, readPayload } from "./hook-io.mjs";

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const VERIFY_COMMAND = /\bnpm run verify\b|scripts[\\/]verify\.mjs/;
const VERIFY_PASSED = /\[verify\] 통과: Node 24 확인/;

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("\n");
  return "";
}

/** 세션 기록 텍스트에서 코드 수정 뒤 verify가 통과했는지 판정한다. */
export function verifyStatus(transcriptText) {
  let order = 0;
  let lastCodeEdit = -1;
  let lastPassedVerify = -1;
  const verifyCalls = new Map();
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
        order += 1;
        const input = part.input ?? {};
        if (EDIT_TOOLS.has(part.name)) {
          const target = String(input.file_path ?? input.notebook_path ?? "");
          if (!target.endsWith(".md")) lastCodeEdit = order;
        } else if (part.name === "Bash" && VERIFY_COMMAND.test(String(input.command ?? ""))) {
          verifyCalls.set(part.id, order);
        }
      } else if (part?.type === "tool_result" && verifyCalls.has(part.tool_use_id)) {
        if (part.is_error !== true && VERIFY_PASSED.test(textOf(part.content))) {
          lastPassedVerify = Math.max(lastPassedVerify, verifyCalls.get(part.tool_use_id));
        }
      }
    }
  }
  return { edited: lastCodeEdit !== -1, verified: lastPassedVerify > lastCodeEdit };
}

const BLOCK_REASON =
  "코드를 고친 뒤에 통과한 `npm run verify`가 없습니다. 끝내기 전에 `npm run verify`를 실행해 통과를 확인하고, 실패하면 원인을 고친 뒤 다시 실행하세요. 기존 테스트의 기대값을 바꿔서 통과시키지 마세요.";

export function decide(payload, readTranscript) {
  let status;
  try {
    status = verifyStatus(readTranscript(payload.transcript_path));
  } catch (error) {
    status = { edited: true, verified: false, error: error.message };
  }
  if (!status.edited || status.verified) return null;
  if (payload.stop_hook_active === true) {
    return { systemMessage: "verify가 통과하지 않은 채로 끝났습니다. 한 번 막은 뒤에도 그대로라서 더 막지 않습니다." };
  }
  return { decision: "block", reason: status.error ? `${BLOCK_REASON} (세션 기록을 읽지 못했습니다: ${status.error})` : BLOCK_REASON };
}

if (isMain(import.meta.url)) {
  emit(decide(await readPayload(), (file) => readFileSync(file, "utf8")));
}
