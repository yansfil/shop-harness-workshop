// 배치 스케줄러: 서버가 떠 있는 동안 1분마다 실행할 배치를 찾는다.
import { CONFIG, STATE, addTimer, hasDb, log, logError, nowIso } from "../legacy/legacyUtils.ts";
import { recoverStale, runDue } from "./batchRunner.ts";

let _timer: any = null;

export function startBatchScheduler(intervalMs?: number): void {
  if (_timer) return;
  const ms = intervalMs || CONFIG.BATCH_CHECK_MS;
  try {
    recoverStale();
  } catch (e) {
    logError("batch_recover_failed", e);
  }
  _timer = setInterval(check, ms);
  addTimer(_timer);
  setTimeout(check, 2000).unref();
  log("batch_scheduler_started", { intervalMs: ms });
}

export function stopBatchScheduler(): void {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

function check(): void {
  if (!hasDb()) return;
  STATE.lastBatchCheck = nowIso();
  try {
    runDue();
  } catch (e) {
    logError("batch_check_failed", e);
  }
}
