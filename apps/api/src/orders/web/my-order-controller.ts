import {
  type MyOrderListResponse,
  OrderParamsSchema,
  type OrderResponse,
  ROUTES,
} from "@grabmarket/contracts";
import type { Router } from "express";
import { notFound } from "../../shared/domain/domain-error.ts";
import type { Controller } from "../../shared/web/controller.ts";
import { requireCustomer } from "../../shared/web/session.ts";
import type { OrderRepository } from "../domain/order.ts";

export class MyOrderController implements Controller {
  readonly #orders: OrderRepository;

  constructor(orders: OrderRepository) {
    this.#orders = orders;
  }

  register(router: Router): void {
    router.get(ROUTES.orders, (_req, res) => {
      const user = requireCustomer(res);
      const orders = this.#orders.listByCustomer(user.id);
      const body: MyOrderListResponse = {
        orders: orders.map((order) => {
          const [first] = order.items;
          if (first === undefined) throw new Error(`주문 ${order.number}에 품목이 없습니다`);
          return {
            id: order.id,
            orderNumber: order.number,
            status: order.status,
            total: order.total,
            itemCount: order.items.length,
            firstItemName: first.productName,
            firstItemImageUrl: first.imagePath,
            createdAt: order.createdAt.toISOString(),
          };
        }),
      };
      res.json(body);
    });

    router.get(ROUTES.order, (req, res) => {
      const user = requireCustomer(res);
      const { orderId } = OrderParamsSchema.parse(req.params);
      const order = this.#orders.findForCustomer(user.id, orderId);
      if (order === undefined) throw notFound("주문");
      const body: OrderResponse = {
        order: {
          id: order.id,
          orderNumber: order.number,
          status: order.status,
          items: order.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            imageUrl: item.imagePath,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
          })),
          subtotal: order.subtotal,
          shippingFee: order.shippingFee,
          total: order.total,
          paymentMethod: order.paymentMethod,
          shipping: order.shipping,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
      };
      res.json(body);
    });
  }
}
