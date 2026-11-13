// 배치 API
import type { Router } from "express";
import { BATCH_JOBS, mustAdmin, mustOneOf, ok, queryStr, wrap } from "../../legacy/legacyUtils.ts";
import { healthSummary, history, runJob, runLogs } from "../batchRunner.ts";

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
    "/api/admin/batch-runs/:job/run",
    wrap((req, res) => {
      mustAdmin(res);
      const job = mustOneOf(String(req.params.job), Object.keys(BATCH_JOBS), "job");
      ok(res, runJob(job, "manual"));
    }),
  );
}
