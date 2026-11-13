// 쿠폰 API
import type { Router } from "express";
import { bodyOf, created, mustAdmin, mustCustomer, ok, paramInt, toInt, wrap } from "../../legacy/legacyUtils.ts";
import * as couponManager from "../couponManager.ts";
import { findById } from "../infra/couponDao.ts";

export function registerCouponRoutes(router: Router): void {
  // 주문서: 내 쿠폰
  router.get(
    "/api/coupons/mine",
    wrap((req, res) => {
      const user = mustCustomer(res);
      const subtotal = req.query.subtotal == null ? null : toInt(req.query.subtotal);
      ok(res, couponManager.walletFor(user.id, subtotal));
    }),
  );

  // 주문서: 쿠폰 코드 확인
  router.post(
    "/api/coupons/check",
    wrap((req, res) => {
      const user = mustCustomer(res);
      const body = bodyOf(req);
      ok(res, couponManager.check(user, body.code, body.subtotal));
    }),
  );

  // 관리자: 쿠폰 목록
  router.get(
    "/api/admin/coupons",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, couponManager.listForAdmin());
    }),
  );

  // 관리자: 쿠폰 발급
  router.post(
    "/api/admin/coupons",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      const result = couponManager.create(admin, bodyOf(req));
      created(res, { ...result, coupon: findById(result.id) });
    }),
  );

  // 관리자: 쿠폰 사용 내역
  router.get(
    "/api/admin/coupons/:couponId/usage",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, couponManager.usage(paramInt(req, "couponId")));
    }),
  );
}
