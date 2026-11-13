// 정산 API
import type { Router } from "express";
import { mustAdmin, mustLogin, ok, queryStr, sendCsv, wrap, fmtMd } from "../../legacy/legacyUtils.ts";
import * as settlementService from "../settlementService.ts";
import { closedDays } from "../infra/settlementQueries.ts";

export function registerSettlementRoutes(router: Router): void {
  // 일별 정산
  router.get(
    "/api/admin/settlements/daily",
    wrap((req, res) => {
      mustLogin(res);
      ok(res, settlementService.daily(queryStr(req, "from"), queryStr(req, "to"), queryStr(req, "q")));
    }),
  );

  // 월별 정산
  router.get(
    "/api/admin/settlements/monthly",
    wrap((req, res) => {
      mustLogin(res);
      ok(res, settlementService.monthly(queryStr(req, "q")));
    }),
  );

  // 일별 CSV
  router.get(
    "/api/admin/settlements/daily.csv",
    wrap((req, res) => {
      mustAdmin(res);
      const file = settlementService.dailyCsv(queryStr(req, "from"), queryStr(req, "to"), queryStr(req, "q"));
      sendCsv(res, file.filename, file.csv);
    }),
  );

  // 월별 CSV
  router.get(
    "/api/admin/settlements/monthly.csv",
    wrap((req, res) => {
      mustAdmin(res);
      const file = settlementService.monthlyCsv(queryStr(req, "q"));
      sendCsv(res, file.filename, file.csv);
    }),
  );

  // 마감된 날
  router.get(
    "/api/admin/settlements/closed",
    wrap((req, res) => {
      mustAdmin(res);
      const range = settlementService.defaultRange();
      const rows = closedDays(queryStr(req, "from", range.from), queryStr(req, "to", range.to));
      ok(res, {
        days: rows.map((r: any) => ({
          day: r.day,
          label: fmtMd(r.day),
          orderCount: r.order_count,
          netAmount: Math.round(r.net_amount),
          closedAt: r.closed_at,
        })),
      });
    }),
  );
}
