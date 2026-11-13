// 배치 실행과 기록
import {
  BATCH_JOBS,
  addDays,
  badRequest,
  batchJobName,
  conflict,
  fmtDurationMs,
  fmtMdHm,
  log,
  logError,
  now,
  nowIso,
  startOfDay,
  ymd,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/batchDao.ts";
import { JOB_DEPENDS_ON, JOB_FUNCTIONS, runKeyFor } from "./application/jobs.ts";

const RUNNING: any = {};

function errorText(e: any): string {
  const message = e && e.message ? String(e.message) : String(e);
  if (/locked|busy/i.test(message)) return "데이터베이스가 잠겨 있었어요";
  if (/no such table/i.test(message)) return "표가 없어요. 마이그레이션을 확인해 주세요";
  return "처리 중 오류가 났어요";
}

/**
 * 배치 하나를 실행하고 기록을 남긴다.
 * trigger: schedule(시각이 되어 자동) / manual(관리자가 지금 실행)
 */
export function runJob(job: string, trigger: string, runKeyInput?: string): any {
  const fn = JOB_FUNCTIONS[job];
  if (!fn) throw badRequest("없는 배치예요.");
  if (RUNNING[job] || dao.isRunning(job)) throw conflict("BATCH_RUNNING", batchJobName(job) + " 배치가 이미 실행 중이에요.");
  const runKey = runKeyInput || runKeyFor(job);
  const startedIso = nowIso();
  const dependsOn = JOB_DEPENDS_ON[job];
  if (dependsOn && trigger === "schedule") {
    const dependRun = dao.lastRun(dependsOn);
    if (dependRun && dependRun.state === "failed" && dependRun.started_at >= startOfDay(now()).toISOString()) {
      const id = dao.insertSkipped(job, runKey, trigger, startedIso, "앞 배치가 실패해 실행하지 않았어요");
      log("batch_skipped", { job: job, runId: id });
      return { id: id, job: job, state: "skipped" };
    }
  }
  const id = dao.startRun(job, runKey, trigger, startedIso);
  RUNNING[job] = true;
  const started = Date.now();
  try {
    const result = fn(id, runKey);
    const duration = Date.now() - started;
    if (result && result.quiet && trigger === "schedule") {
      dao.deleteRun(id);
      return { id: null, job: job, state: "success", quiet: true };
    }
    const prev = dao.lastRun(job, runKey);
    let note = result.note;
    if (!note && prev && prev.id !== id) {
      const before = dao.listRuns(job, 5).find((r: any) => r.id !== id && r.run_key === runKey && r.state === "failed");
      if (before) note = fmtMdHm(before.started_at).slice(6) + " 실패분을 다시 실행했어요";
    }
    dao.finishRun(id, "success", result.processed, result.total, note, nowIso(), duration);
    log("batch_finished", { job: job, runId: id, processed: result.processed, ms: duration });
    return { id: id, job: job, state: "success", processed: result.processed, total: result.total };
  } catch (e: any) {
    const duration = Date.now() - started;
    dao.finishRun(id, "failed", 0, null, errorText(e), nowIso(), duration);
    logError("batch_failed", e, { job: job, runId: id });
    return { id: id, job: job, state: "failed", note: errorText(e) };
  } finally {
    RUNNING[job] = false;
    dao.trimOld(job, 400);
  }
}

/** 관리자 화면: 실행 기록 */
export function history(job: string | null): any {
  const rows = dao.listRuns(job, 120);
  return {
    schedule: Object.keys(BATCH_JOBS)
      .filter((k) => BATCH_JOBS[k].time)
      .map((k) => ({ job: k, name: BATCH_JOBS[k].name, time: BATCH_JOBS[k].time })),
    jobs: Object.keys(BATCH_JOBS).map((k) => ({ job: k, name: BATCH_JOBS[k].name })),
    runs: rows.map((r: any) => ({
      id: r.id,
      job: r.job_name,
      jobName: batchJobName(r.job_name),
      runKey: r.run_key,
      startedAt: r.started_at,
      startedAtText: fmtMdHm(r.started_at),
      durationMs: r.duration_ms,
      durationText: r.duration_ms == null ? null : fmtDurationMs(r.duration_ms),
      processed: r.processed,
      total: r.total,
      processedText:
        r.processed == null ? null : r.state === "failed" && r.total != null ? r.total + "건 중 " + r.processed + "건" : r.processed + "건",
      state: r.state,
      note: r.note,
      trigger: r.trigger,
    })),
  };
}

/** 오늘 실행해야 하는데 아직 안 한 배치를 실행한다(스케줄러가 1분마다 부른다) */
export function runDue(): any[] {
  const results: any[] = [];
  const current = now();
  for (const job of Object.keys(BATCH_JOBS)) {
    const time = BATCH_JOBS[job].time;
    try {
      if (!time) {
        results.push(runJob(job, "schedule"));
        continue;
      }
      const parts = String(time).split(":");
      const dueAt = new Date(startOfDay(current).getTime() + Number(parts[0]) * 3600000 + Number(parts[1]) * 60000);
      if (current.getTime() < dueAt.getTime()) continue;
      const key = runKeyFor(job);
      if (dao.hasSuccess(job, key)) continue;
      const last = dao.lastRun(job, key);
      if (last && (last.state === "failed" || last.state === "skipped")) continue;
      results.push(runJob(job, "schedule", key));
    } catch (e) {
      logError("batch_due_failed", e, { job: job });
    }
  }
  return results;
}

/** 서버가 죽어 끝나지 않은 기록을 실패로 바꾼다 */
export function recoverStale(): number {
  return dao.clearStaleRunning(addDays(now(), -1 / 24).toISOString());
}

export function yesterdayKey(): string {
  return ymd(addDays(startOfDay(now()), -1));
}
