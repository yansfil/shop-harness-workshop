// 결제 API
import type { Router } from "express";
import { bodyOf, getServices, mustLogin, wrap, loadPayment } from "../../legacy/legacyUtils.ts";
import { checkout } from "../application/checkoutService.ts";
import { toOrderResponse } from "../../orders/web/order-mapper.ts";
import { paymentDto } from "./orderExtrasController.ts";

export function registerCheckoutRoutes(router: Router): void {
  // 결제하기: 응답은 주문 생성(POST /api/orders)과 같은 모양에 결제 내역을 더한다
  router.post(
    "/api/checkout",
    wrap(async (req, res) => {
      const user = mustLogin(res);
      const result = await checkout(user, bodyOf(req));
      const order = getServices().orderRepository.findById(result.orderId);
      res.status(result.created ? 201 : 200).json({ ...toOrderResponse(order), payment: paymentDto(loadPayment(result.orderId)) });
    }),
  );
}
