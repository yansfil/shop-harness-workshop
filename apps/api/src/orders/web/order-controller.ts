import { CreateOrderRequestSchema, OrderParamsSchema, OrderQuoteRequestSchema, ROUTES } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import { requireCustomer, requireUser } from "../../shared/web/session.ts";
import type { OrderService } from "../application/order-service.ts";
import { toOrderResponse, toQuoteDto } from "./order-mapper.ts";

/** 견적, 주문 생성, 주문 취소. 고객은 세션에서만 정한다(본문에 고객 ID가 없다). */
export class OrderController implements Controller {
  readonly #orders: OrderService;

  constructor(orders: OrderService) {
    this.#orders = orders;
  }

  register(router: Router): void {
    router.post(ROUTES.orderQuote, (req, res) => {
      const { items } = OrderQuoteRequestSchema.parse(req.body);
      res.json(toQuoteDto(this.#orders.quote(items)));
    });

    router.post(ROUTES.orders, (req, res) => {
      const buyer = requireUser(res);
      const input = CreateOrderRequestSchema.parse(req.body);
      const placed = this.#orders.place(buyer, input);
      res.status(placed.created ? 201 : 200).json(toOrderResponse(placed.order));
    });
 
    router.post(ROUTES.orderCancel, (req, res) => {
      const customer = requireCustomer(res);
      const { orderId } = OrderParamsSchema.parse(req.params);
      res.json(toOrderResponse(this.#orders.cancel(customer, orderId)));
    });
  }
}
