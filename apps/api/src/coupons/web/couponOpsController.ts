// 쿠폰 운영 API (관리자)
import type { Router } from "express";
import { bodyOf, mustAdmin, ok, sendCsv, wrap } from "../../legacy/legacyUtils.ts";
import * as couponOps from "../couponOps.ts";

export function registerCouponOpsRoutes(router: Router): void {
  router.get(
    "/api/admin/coupons-ending",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, { coupons: couponOps.endingSoon() });
    }),
  );

  router.post(
    "/api/admin/coupons/:couponId/pause",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, couponOps.pause(req.params.couponId));
    }),
  );

  router.post(
    "/api/admin/coupons/:couponId/resume",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, couponOps.resume(req.params.couponId));
    }),
  );

  router.post(
    "/api/admin/coupons/:couponId/extend",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, couponOps.extend(req.params.couponId, bodyOf(req).endsAt));
    }),
  );

  router.post(
    "/api/admin/coupons/:couponId/limit",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, couponOps.raiseLimit(req.params.couponId, bodyOf(req).issueLimit));
    }),
  );

  router.post(
    "/api/admin/coupons/:couponId/send",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, couponOps.sendTo(req.params.couponId, bodyOf(req).emails));
    }),
  );

  router.get(
    "/api/admin/coupons/:couponId/holders",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, couponOps.holders(req.params.couponId));
    }),
  );

  router.get(
    "/api/admin/coupons/:couponId/holders.csv",
    wrap((req, res) => {
      mustAdmin(res);
      const file = couponOps.holdersCsv(req.params.couponId);
      sendCsv(res, file.filename, file.csv);
    }),
  );
}
