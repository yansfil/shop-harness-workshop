// 교환 재발송·반품 통계 API (관리자)
import type { Router } from "express";
import { bodyOf, mustAdmin, ok, queryStr, wrap } from "../../legacy/legacyUtils.ts";
import * as exchangeShipping from "../exchangeShipping.ts";

export function registerReturnOpsRoutes(router: Router): void {
  router.get(
    "/api/admin/exchanges/to-ship",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, exchangeShipping.pendingReships());
    }),
  );

  router.post(
    "/api/admin/exchanges/:returnId/ship",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      const body = bodyOf(req);
      ok(res, exchangeShipping.registerReship(admin, req.params.returnId, body.courierCode, body.trackingNo));
    }),
  );

  router.get(
    "/api/admin/return-stats",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, exchangeShipping.reasonStats(queryStr(req, "from"), queryStr(req, "to")));
    }),
  );
}
