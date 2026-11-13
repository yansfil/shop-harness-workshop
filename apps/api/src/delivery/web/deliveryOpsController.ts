// 배송 운영 API (관리자)
import type { Router } from "express";
import { bodyOf, mustAdmin, ok, queryStr, sendCsv, wrap } from "../../legacy/legacyUtils.ts";
import * as deliveryOps from "../deliveryOps.ts";

export function registerDeliveryOpsRoutes(router: Router): void {
  router.post(
    "/api/admin/shipments/bulk/check",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, deliveryOps.checkBulk(bodyOf(req).text));
    }),
  );

  router.post(
    "/api/admin/shipments/bulk",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      ok(res, deliveryOps.registerBulk(admin, bodyOf(req).text));
    }),
  );

  router.get(
    "/api/admin/shipments/delays",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, deliveryOps.delays());
    }),
  );

  router.get(
    "/api/admin/shipments/couriers/stats",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, deliveryOps.courierStats(queryStr(req, "from"), queryStr(req, "to")));
    }),
  );

  router.get(
    "/api/admin/shipments.csv",
    wrap((req, res) => {
      mustAdmin(res);
      const file = deliveryOps.shipmentsCsv(queryStr(req, "from"), queryStr(req, "to"));
      sendCsv(res, file.filename, file.csv);
    }),
  );
}
