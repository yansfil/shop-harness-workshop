// 배치 API
import type { Router } from "express";
import { BATCH_JOBS, mustAdmin, mustOneOf, ok, queryStr, wrap } from "../../legacy/legacyUtils.ts";
import { history, runJob } from "../batchRunner.ts";

export function registerBatchRoutes(router: Router): void {
  router.get(
    "/api/admin/batch-runs",
    wrap((req, res) => {
      mustAdmin(res);
      const job = queryStr(req, "job");
      ok(res, history(job === "" ? null : job));
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
