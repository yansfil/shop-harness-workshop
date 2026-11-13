import { type MyOrderListResponse, OrderParamsSchema, ROUTES } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import { requireCustomer } from "../../shared/web/session.ts";
import type { OrderService } from "../application/order-service.ts";
import { toOrderResponse, toOrderSummaryDto } from "./order-mapper.ts";

/** 내 주문 목록과 상세. 고객은 세션에서만 정하고, 남의 주문 번호는 NotFound다. */
export class MyOrderController implements Controller {
  readonly #orders: OrderService;

  constructor(orders: OrderService) {
    this.#orders = orders;
  }

  register(router: Router): void {
    router.get(ROUTES.orders, (_req, res) => {
      const user = requireCustomer(res);
      const orders = this.#orders.listForCustomer(user.id);
      res.json({ orders: orders.map(toOrderSummaryDto) } satisfies MyOrderListResponse);
    });

    router.get(ROUTES.order, (req, res) => {
      const user = requireCustomer(res);
      const { orderId } = OrderParamsSchema.parse(req.params);
      res.json(toOrderResponse(this.#orders.getForCustomer(user.id, orderId)));
    });
  }
}
