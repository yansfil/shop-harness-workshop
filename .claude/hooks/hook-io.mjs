// Hook 네 개가 같이 쓰는 입출력 도우미. Hook은 stdin으로 JSON을 받고 stdout으로 JSON을 돌려준다.
import { fileURLToPath } from "node:url";

export function isMain(metaUrl) {
  return process.argv[1] !== undefined && fileURLToPath(metaUrl) === process.argv[1];
}

export async function readPayload() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Hook 입력이 JSON이 아닙니다: ${error.message}`, { cause: error });
  }
}

export function emit(output) {
  if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
}

export function denyTool(reason) {
  return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
}

export function addContext(event, text) {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}
