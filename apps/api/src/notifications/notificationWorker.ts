// 알림 보내기 작업자: 서버가 떠 있는 동안 몇 초마다 대기열을 비운다.
import { CONFIG, STATE, addTimer, hasDb, log, logError } from "../legacy/legacyUtils.ts";
import { processDue } from "./notificationQueue.ts";

let _timer: any = null;
let _busy = false;

export function startNotificationWorker(intervalMs?: number): void {
  if (_timer) return;
  const ms = intervalMs || CONFIG.NOTIFY_INTERVAL_MS;
  _timer = setInterval(tick, ms);
  addTimer(_timer);
  STATE.workerRunning = true;
  log("notification_worker_started", { intervalMs: ms });
}

export function stopNotificationWorker(): void {
  if (_timer) clearInterval(_timer);
  _timer = null;
  STATE.workerRunning = false;
}

export function tick(): any {
  if (_busy || !hasDb()) return null;
  _busy = true;
  try {
    return processDue(CONFIG.NOTIFY_BATCH_SIZE);
  } catch (e) {
    logError("notification_worker_tick_failed", e);
    return null;
  } finally {
    _busy = false;
  }
}
