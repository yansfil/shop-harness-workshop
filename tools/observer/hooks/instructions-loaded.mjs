// InstructionsLoaded Hook. start.mjs가 `--settings tools/observer/hooks/settings.json`으로 붙인다.
// Claude Code가 CLAUDE.md·Rules 파일을 읽을 때마다 stdin으로 받은 내용에 기록 시각을 붙여
// <CLAUDE_CONFIG_DIR>/observer/instructions/<session_id>.jsonl에 한 줄씩 남긴다. 세션 뷰어의 지침 지도 탭이 읽는다.
// CLAUDE_CONFIG_DIR이 없으면 원래 ~/.claude에 쓰게 되므로 아무것도 쓰지 않고 실패한다. 기록 폴더를 바꾸는 다른 길은 두지 않는다.
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

function fail(message) {
  process.stderr.write(`[instructions-loaded] ${message}\n`);
  process.exit(1);
}

function logDirectory() {
  if (!process.env.CLAUDE_CONFIG_DIR) return fail("CLAUDE_CONFIG_DIR이 없어 기록하지 않았습니다. node start.mjs로 시작하세요.");
  return path.join(process.env.CLAUDE_CONFIG_DIR, "observer", "instructions");
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));

const sessionId = input.session_id;
if (typeof sessionId !== "string" || !/^[A-Za-z0-9-]+$/.test(sessionId)) fail("session_id가 없거나 형식이 다릅니다.");

const dir = logDirectory();
mkdirSync(dir, { recursive: true });
appendFileSync(path.join(dir, `${sessionId}.jsonl`), `${JSON.stringify({ observed_at: new Date().toISOString(), ...input })}\n`);
