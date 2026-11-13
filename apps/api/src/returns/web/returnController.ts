// 반품·교환 API
import type { Router } from "express";
import { bodyOf, created, mustAdmin, mustCustomer, ok, paramInt, queryStr, wrap } from "../../legacy/legacyUtils.ts";
import * as returnManager from "../returnManager.ts";
import { countByState } from "../infra/returnDao.ts";

export function registerReturnRoutes(router: Router): void {
  router.get(
    "/api/returns",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, returnManager.mine(user));
    }),
  );

  router.get(
    "/api/returns/eligible-orders",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, returnManager.eligibleOrders(user));
    }),
  );

  router.post(
    "/api/returns",
    wrap((req, res) => {
      const user = mustCustomer(res);
      created(res, returnManager.request(user, bodyOf(req)));
    }),
  );

  router.get(
    "/api/admin/returns",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, returnManager.adminList(queryStr(req, "state", "requested")));
    }),
  );

  router.get(
    "/api/admin/returns/counts",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, countByState());
    }),
  );

  router.post(
    "/api/returns/:returnId/withdraw",
    wrap((req, res) => {
      const user = mustCustomer(res);
      ok(res, returnManager.withdraw(user, paramInt(req, "returnId")));
    }),
  );

  router.post(
    "/api/admin/returns/:returnId/approve",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      ok(res, returnManager.approve(admin, paramInt(req, "returnId")));
    }),
  );

  router.post(
    "/api/admin/returns/:returnId/reject",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      ok(res, returnManager.reject(admin, paramInt(req, "returnId"), bodyOf(req).reason));
    }),
  );
}
