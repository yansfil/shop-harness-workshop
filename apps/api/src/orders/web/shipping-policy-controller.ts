import { ROUTES, type ShippingPolicyResponse } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import { getShippingPolicy } from "../application/shipping-policy.ts";

export class ShippingPolicyController implements Controller {
  register(router: Router): void {
    router.get(ROUTES.shippingPolicy, (_req, res) => {
      const { fee, freeThreshold } = getShippingPolicy();
      const body: ShippingPolicyResponse = { fee, freeThreshold };
      res.json(body);
    });
  }
}
