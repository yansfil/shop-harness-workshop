// 포인트 지급 행사·소멸 예정 API
import type { Router } from "express";
import { bodyOf, created, mustAdmin, mustCustomer, ok, queryStr, sendCsv, wrap } from "../../legacy/legacyUtils.ts";
import * as pointCampaigns from "../pointCampaigns.ts";

export function registerPointCampaignRoutes(router: Router): void {
  // 내 포인트 소멸 예정
  router.get(
    "/api/points/expiring",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, pointCampaigns.expiringSchedule(user.id));
    }),
  );

  router.get(
    "/api/admin/point-campaigns",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, pointCampaigns.campaigns());
    }),
  );

  router.post(
    "/api/admin/point-campaigns/preview",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, pointCampaigns.preview(bodyOf(req)));
    }),
  );

  router.post(
    "/api/admin/point-campaigns",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      created(res, pointCampaigns.grant(admin, bodyOf(req)));
    }),
  );

  router.get(
    "/api/admin/point-members",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, pointCampaigns.findMembers(queryStr(req, "q")));
    }),
  );

  router.get(
    "/api/admin/point-ledger.csv",
    wrap((req, res) => {
      mustAdmin(res);
      const file = pointCampaigns.ledgerCsv(queryStr(req, "from"), queryStr(req, "to"));
      sendCsv(res, file.filename, file.csv);
    }),
  );
}
