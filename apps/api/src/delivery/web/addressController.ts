// 배송지 변경 API
import type { Router } from "express";
import { bodyOf, mustAdmin, mustCustomer, mustLogin, ok, paramInt, wrap } from "../../legacy/legacyUtils.ts";
import * as addressChange from "../addressChange.ts";
import { myShipments } from "../myShipments.ts";

export function registerAddressRoutes(router: Router): void {
  // 내 배송 모아 보기
  router.get(
    "/api/shipments/mine",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, myShipments(user));
    }),
  );

  router.get(
    "/api/orders/:orderId/shipping-address",
    wrap((req, res) => {
      const user = mustLogin(res);
      ok(res, addressChange.history(user, paramInt(req, "orderId")));
    }),
  );

  router.put(
    "/api/orders/:orderId/shipping-address",
    wrap((req, res) => {
      const user = mustLogin(res);
      ok(res, addressChange.changeAddress(user, paramInt(req, "orderId"), bodyOf(req)));
    }),
  );

  router.get(
    "/api/admin/address-changes",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, addressChange.recent());
    }),
  );
}
