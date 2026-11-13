import { ChangeOrderStatusRequestSchema, OrderParamsSchema, ROUTES } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import { requireAdmin } from "../../shared/web/session.ts";
import type { AdminOrderService } from "../application/admin-order-service.ts";
import { toAdminOrderDto, toAdminOrderListDto } from "./order-mapper.ts";

export class AdminOrderController implements Controller {
  readonly #orders: AdminOrderService;

  constructor(orders: AdminOrderService) {
    this.#orders = orders;
  }

  register(router: Router): void {
    router.get(ROUTES.adminOrders, (_req, res) => {
      requireAdmin(res);
      res.json(toAdminOrderListDto(this.#orders.list()));
    });

    router.get(ROUTES.adminOrder, (req, res) => {
      requireAdmin(res);
      const { orderId } = OrderParamsSchema.parse(req.params);
      res.json(toAdminOrderDto(this.#orders.get(orderId)));
    });

    router.post(ROUTES.adminOrderStatus, (req, res) => {
      requireAdmin(res);
      const { orderId } = OrderParamsSchema.parse(req.params);
      const { status } = ChangeOrderStatusRequestSchema.parse(req.body);
      res.json(toAdminOrderDto(this.#orders.changeStatus(orderId, status)));
    });
  }
}
