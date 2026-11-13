// 배치 API
import type { Router } from "express";
import { BATCH_JOBS, bodyOf, mustAdmin, mustOneOf, ok, queryStr, wrap } from "../../legacy/legacyUtils.ts";
import { healthSummary, history, runJob, runLogs, setJobPaused } from "../batchRunner.ts";

export function registerBatchRoutes(router: Router): void {
  router.get(
    "/api/admin/batch-runs",
    wrap((req, res) => {
      mustAdmin(res);
      const job = queryStr(req, "job");
      ok(res, history(job === "" ? null : job));
    }),
  );

  router.get(
    "/api/admin/batch-health",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, healthSummary());
    }),
  );

  router.get(
    "/api/admin/batch-runs/:runId/logs",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, runLogs(req.params.runId));
    }),
  );

  router.post(
    "/api/admin/batch-jobs/:job/pause",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      ok(res, setJobPaused(admin, String(req.params.job), true, bodyOf(req).memo));
    }),
  );

  router.post(
    "/api/admin/batch-jobs/:job/resume",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      ok(res, setJobPaused(admin, String(req.params.job), false, null));
    }),
  );

  router.post(
    "/api/admin/batch-runs/:job/run",
    wrap((req, res) => {
      mustAdmin(res);
      const job = mustOneOf(String(req.params.job), Object.keys(BATCH_JOBS), "job");
      ok(res, runJob(job, "manual"));
    }),
  );
}
