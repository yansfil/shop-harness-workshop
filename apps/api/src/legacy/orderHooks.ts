// 주문 취소 뒤 처리: 결제 금액 환불, 쿠폰 되돌리기, 사용 포인트 되돌리기, 고객 알림
import { emit, insert, log, one, run } from "./legacyUtils.ts";
import * as couponManager from "../coupons/couponManager.ts";
import * as pointManager from "../points/pointManager.ts";

export const legacyCancelListener = {
  orderCancelled(order: any, at: Date): void {
    const when = at.toISOString();
    const pay: any = one("SELECT * FROM order_payments WHERE order_id = ?", order.id);
    let refundAmount = order.total;
    if (pay) {
      refundAmount = pay.paid_amount - pay.refunded_amount;
      run("UPDATE order_payments SET refunded_amount = paid_amount, refund_status = 'full', updated_at = ? WHERE order_id = ?", when, order.id);
      if (pay.coupon_id) couponManager.restoreForOrder(order.id, when);
      if (pay.point_used > 0) pointManager.refund(order.customer.id, pay.point_used, order.id, "주문 취소 환불", when);
    } else {
      insert("order_payments", {
        order_id: order.id,
        coupon_id: null,
        coupon_discount: 0,
        point_used: 0,
        paid_amount: order.total,
        reward_points: 0,
        refunded_amount: order.total,
        refund_status: "full",
        created_at: order.createdAt.toISOString(),
        updated_at: when,
      });
    }
    log("order_cancel_settled", { orderId: order.id, refundAmount: refundAmount });
    emit("order.cancelled", { orderId: order.id, refundAmount: refundAmount, at: when });
  },
};
