// 정산 항목별 리포트·조정·지급 예정 API (관리자)
import type { Router } from "express";
import { bodyOf, created, mustAdmin, ok, queryStr, sendCsv, wrap } from "../../legacy/legacyUtils.ts";
import * as reports from "../settlementReports.ts";

export function registerSettlementReportRoutes(router: Router): void {
  router.get(
    "/api/admin/settlements/breakdown",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, reports.breakdown(queryStr(req, "from"), queryStr(req, "to")));
    }),
  );

  router.get(
    "/api/admin/settlements/breakdown/:kind.csv",
    wrap((req, res) => {
      mustAdmin(res);
      const file = reports.breakdownCsv(req.params.kind, queryStr(req, "from"), queryStr(req, "to"));
      sendCsv(res, file.filename, file.csv);
    }),
  );

  router.get(
    "/api/admin/settlements/adjustments",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, reports.adjustments(queryStr(req, "from"), queryStr(req, "to")));
    }),
  );

  router.post(
    "/api/admin/settlements/adjustments",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      created(res, reports.addAdjustment(admin, bodyOf(req)));
    }),
  );

  router.post(
    "/api/admin/settlements/adjustments/:id/cancel",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, reports.cancelAdjustmentById(req.params.id));
    }),
  );

  router.get(
    "/api/admin/settlements/payouts",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, reports.payouts(queryStr(req, "from"), queryStr(req, "to")));
    }),
  );

  router.get(
    "/api/admin/settlements/payouts.csv",
    wrap((req, res) => {
      mustAdmin(res);
      const file = reports.payoutsCsv(queryStr(req, "from"), queryStr(req, "to"));
      sendCsv(res, file.filename, file.csv);
    }),
  );
}
