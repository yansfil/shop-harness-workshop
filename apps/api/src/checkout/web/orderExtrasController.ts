// 주문 상세 (결제 내역·배송·취소·반품 정보를 같이 싣는다)
import type { Router } from "express";
import { courierName, fmtMdHm, getServices, isAdmin, loadPayment, mustLogin, notFoundError, ok, one, paramInt, wrap } from "../../legacy/legacyUtils.ts";
import { toOrderDetailDto } from "../../orders/web/order-mapper.ts";
import { isCancellable } from "../../orders/domain/order-status.ts";
import { eligibilityFor, forOrder } from "../../returns/returnManager.ts";

export function paymentDto(pay: any): any {
  if (!pay) return null;
  const coupon = pay.coupon_id ? one("SELECT code, name FROM coupons WHERE id = ?", pay.coupon_id) : null;
  return {
    couponCode: coupon ? coupon.code : null,
    couponName: coupon ? coupon.name : null,
    couponDiscount: pay.coupon_discount,
    pointUsed: pay.point_used,
    paidAmount: pay.paid_amount,
    rewardPoints: pay.reward_points,
    refundedAmount: pay.refunded_amount,
    refundStatus: pay.refund_status,
  };
}

function cancelInfo(order: any): any {
  if (order.status === "cancelled") {
    const c = one("SELECT * FROM order_cancellations WHERE order_id = ?", order.id);
    return { cancellable: false, cancelBlockedReason: "이미 취소된 주문이에요.", cancelledAt: c ? c.created_at : null, cancelledAtText: c ? fmtMdHm(c.created_at) : null };
  }
  if (isCancellable(order.status)) return { cancellable: true, cancelBlockedReason: null, cancelledAt: null, cancelledAtText: null };
  return {
    cancellable: false,
    cancelBlockedReason: order.status === "delivered" ? "배송이 끝난 주문은 반품으로 신청해 주세요." : "배송이 시작돼 취소할 수 없어요. 받은 뒤 반품을 신청해 주세요.",
    cancelledAt: null,
    cancelledAtText: null,
  };
}

export function registerOrderExtrasRoutes(router: Router): void {
  router.get(
    "/api/order-extras/:orderId",
    wrap((req, res) => {
      const user = mustLogin(res);
      const orders = getServices().orderRepository;
      const orderId = paramInt(req, "orderId");
      // 고객은 내 주문만, 남의 주문이면 있다는 사실도 드러내지 않고 404. 관리자는 모든 주문.
      const order = isAdmin(user) ? orders.findById(orderId) : orders.findForCustomer(user.id, orderId);
      if (!order) throw notFoundError("주문을 찾을 수 없습니다.");
      const shipment = one("SELECT * FROM shipments WHERE order_id = ?", order.id);
      ok(res, {
        order: { ...toOrderDetailDto(order), customerName: order.customer.name },
        payment: paymentDto(loadPayment(order.id)),
        shipment: shipment
          ? { courierCode: shipment.courier_code, courierName: courierName(shipment.courier_code), trackingNo: shipment.tracking_no, deliveredAt: shipment.delivered_at }
          : null,
        ...cancelInfo(order),
        ...eligibilityFor({ id: order.id, status: order.status }),
        returns: forOrder(order.id),
      });
    }),
  );
}
