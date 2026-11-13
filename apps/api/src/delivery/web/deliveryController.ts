// 배송 API
import type { Router } from "express";
import { bodyOf, created, mustAdmin, mustCustomer, ok, paramInt, queryStr, wrap } from "../../legacy/legacyUtils.ts";
import * as deliveryManager from "../deliveryManager.ts";
import { couriers } from "../infra/fakeCourierApi.ts";

export function registerDeliveryRoutes(router: Router): void {
  // 고객: 배송 추적
  router.get(
    "/api/orders/:orderId/tracking",
    wrap((req, res) => {
      const user = mustCustomer(res);
      ok(res, deliveryManager.trackingFor(user, paramInt(req, "orderId")));
    }),
  );

  // 관리자: 배송 현황
  router.get(
    "/api/admin/shipments",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, deliveryManager.board(queryStr(req, "status", "preparing")));
    }),
  );

  router.get(
    "/api/admin/shipments/couriers",
    wrap((req, res) => {
      mustAdmin(res);
      const code = queryStr(req, "courier", "SB");
      ok(res, { couriers: couriers(), suggestedTrackingNo: deliveryManager.suggestTrackingNo(code) });
    }),
  );

  // 관리자: 송장 등록
  router.post(
    "/api/admin/shipments",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      const body = bodyOf(req);
      const result = deliveryManager.register(admin, body.orderId, body.courierCode, body.trackingNo);
      if (result.created) created(res, result);
      else ok(res, result);
    }),
  );

  // 관리자: 배송 완료 동기화를 지금
  router.post(
    "/api/admin/shipments/sync",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, deliveryManager.syncDelivered());
    }),
  );
}
