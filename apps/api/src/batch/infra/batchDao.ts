// 배치 실행 기록 표
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";

export function startRun(job: string, runKey: string, trigger: string, atIso: string): number {
  return insert("batch_runs", {
    job_name: job,
    run_key: runKey,
    started_at: atIso,
    finished_at: null,
    duration_ms: null,
    processed: null,
    total: null,
    state: "running",
    note: null,
    trigger: trigger,
  });
}

export function finishRun(id: number, state: string, processed: any, total: any, note: any, finishedIso: string, durationMs: number): void {
  run(
    "UPDATE batch_runs SET state = ?, processed = ?, total = ?, note = ?, finished_at = ?, duration_ms = ? WHERE id = ?",
    state,
    processed == null ? null : Number(processed),
    total == null ? null : Number(total),
    note == null ? null : String(note),
    finishedIso,
    durationMs,
    id,
  );
}

export function insertSkipped(job: string, runKey: string, trigger: string, atIso: string, note: string): number {
  return insert("batch_runs", {
    job_name: job,
    run_key: runKey,
    started_at: atIso,
    finished_at: atIso,
    duration_ms: null,
    processed: null,
    total: null,
    state: "skipped",
    note: note,
    trigger: trigger,
  });
}

export function deleteRun(id: number): void {
  run("DELETE FROM batch_run_logs WHERE run_id = ?", id);
  run("DELETE FROM batch_runs WHERE id = ?", id);
}

export function addLogs(runId: number, level: string, messages: string[], atIso: string): void {
  for (const m of messages) insert("batch_run_logs", { run_id: runId, level: level, message: String(m).slice(0, 300), created_at: atIso });
}

export function logsOf(runId: number): any[] {
  return all("SELECT * FROM batch_run_logs WHERE run_id = ? ORDER BY id", runId);
}

export function findRun(id: number): any {
  return one("SELECT * FROM batch_runs WHERE id = ?", id);
}

/** 작업별 최근 30일 성공·실패 수 */
export function stateCounts(sinceIso: string): any[] {
  return all("SELECT job_name, state, COUNT(*) AS n FROM batch_runs WHERE started_at >= ? GROUP BY job_name, state", sinceIso);
}

export function lastRun(job: string, runKey?: string): any {
  if (runKey) return one("SELECT * FROM batch_runs WHERE job_name = ? AND run_key = ? ORDER BY id DESC LIMIT 1", job, runKey);
  return one("SELECT * FROM batch_runs WHERE job_name = ? ORDER BY id DESC LIMIT 1", job);
}

export function hasSuccess(job: string, runKey: string): boolean {
  return !!one("SELECT id FROM batch_runs WHERE job_name = ? AND run_key = ? AND state = 'success' LIMIT 1", job, runKey);
}

export function isRunning(job: string): boolean {
  return !!one("SELECT id FROM batch_runs WHERE job_name = ? AND state = 'running' LIMIT 1", job);
}

export function listRuns(job: string | null, limit: number): any[] {
  if (job) return all("SELECT * FROM batch_runs WHERE job_name = ? ORDER BY started_at DESC, id DESC LIMIT ?", job, limit);
  return all("SELECT * FROM batch_runs ORDER BY started_at DESC, id DESC LIMIT ?", limit);
}

export function clearStaleRunning(beforeIso: string): number {
  return Number(run("UPDATE batch_runs SET state = 'failed', note = '서버가 멈춰 끝나지 않았어요' WHERE state = 'running' AND started_at < ?", beforeIso).changes);
}

export function trimOld(job: string, keep: number): number {
  run(
    "DELETE FROM batch_run_logs WHERE run_id IN (SELECT id FROM batch_runs WHERE job_name = ? AND id NOT IN (SELECT id FROM batch_runs WHERE job_name = ? ORDER BY id DESC LIMIT ?))",
    job,
    job,
    keep,
  );
  return Number(
    run(
      "DELETE FROM batch_runs WHERE job_name = ? AND id NOT IN (SELECT id FROM batch_runs WHERE job_name = ? ORDER BY id DESC LIMIT ?)",
      job,
      job,
      keep,
    ).changes,
  );
}
