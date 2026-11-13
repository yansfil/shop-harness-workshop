// 결제 API
import type { Router } from "express";
import { bodyOf, getServices, mustCustomer, mustLogin, ok, wrap, loadPayment } from "../../legacy/legacyUtils.ts";
import { checkout } from "../application/checkoutService.ts";
import { quoteCheckout } from "../application/checkoutQuote.ts";
import { toOrderResponse } from "../../orders/web/order-mapper.ts";
import { paymentDto } from "./orderExtrasController.ts";

export function registerCheckoutRoutes(router: Router): void {
  // 주문서 금액 미리 보기(쿠폰·포인트 포함)
  router.post(
    "/api/checkout/quote",
    wrap((req, res) => {
      const user = mustCustomer(res);
      ok(res, quoteCheckout(user, bodyOf(req)));
    }),
  );

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
