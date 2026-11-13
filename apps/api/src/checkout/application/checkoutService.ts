// 결제: 쿠폰·포인트를 쓰는 주문은 예전 결제 흐름으로, 그 밖의 주문은 주문 서비스로 보낸다.
// 어느 쪽이든 주문 생성·가격 계산·재고 차감·주문 번호는 OrderService.place가 하고, 여기서는 결제 내역과 쿠폰·포인트만 더한다.
import { CreateOrderRequestSchema } from "@grabmarket/contracts";
import {
  LegacyError,
  conflict,
  emit,
  getServices,
  insert,
  isBlank,
  log,
  one,
  toInt,
  trim,
  tx,
} from "../../legacy/legacyUtils.ts";
import { InsufficientStockError } from "../../inventory/domain/stock.ts";
import * as couponManager from "../../coupons/couponManager.ts";
import * as pointManager from "../../points/pointManager.ts";
import { calcRewardPoints, checkUsePoints } from "../../points/domain/pointPolicy.ts";

function findExisting(userId: number, idempotencyKey: string): any {
  return one("SELECT id FROM orders WHERE customer_id = ? AND idempotency_key = ?", userId, idempotencyKey);
}

function savePayment(orderId: number, couponId: any, couponDiscount: number, pointUsed: number, paidAmount: number, rewardPoints: number, at: string): void {
  insert("order_payments", {
    order_id: orderId,
    coupon_id: couponId,
    coupon_discount: couponDiscount,
    point_used: pointUsed,
    paid_amount: paidAmount,
    reward_points: rewardPoints,
    refunded_amount: 0,
    refund_status: "none",
    created_at: at,
    updated_at: at,
  });
}

/**
 * 결제하기
 * 적립 포인트는 요청이 아니라 실제 결제 금액의 1%로 서버가 정한다.
 * 돌려주는 값: { created, orderId }
 */
export async function checkout(user: any, body: any): Promise<any> {
  if (!user || user.role !== "customer") {
    throw new LegacyError(403, "ADMIN_CANNOT_ORDER", "관리자 계정으로는 주문할 수 없습니다. 고객 계정으로 로그인해 주세요.");
  }
  const base = CreateOrderRequestSchema.parse({
    idempotencyKey: body.idempotencyKey,
    items: body.items,
    shipping: body.shipping,
    paymentMethod: body.paymentMethod,
  });
  const couponCode = trim(body.couponCode);
  const usePoints = toInt(body.usePoints);
  const services = getServices();

  if (isBlank(couponCode) && usePoints === 0) {
    const result = tx(() => {
      const placed = services.orders.place(user, base);
      if (!placed.created) return { created: false, orderId: placed.order.id, at: "" };
      const at = placed.order.createdAt.toISOString();
      const rewardPoints = calcRewardPoints(placed.order.total);
      savePayment(placed.order.id, null, 0, 0, placed.order.total, rewardPoints, at);
      if (rewardPoints > 0) pointManager.earn(user.id, rewardPoints, placed.order.id, undefined, at);
      return { created: true, orderId: placed.order.id, at: at };
    });
    if (result.created) emit("order.placed", { orderId: result.orderId, at: result.at });
    return { created: result.created, orderId: result.orderId };
  }

  const existing = findExisting(user.id, base.idempotencyKey);
  if (existing) return { created: false, orderId: existing.id };

  const quote = services.orders.quote(base.items);
  if (quote.shortages.length > 0) throw new InsufficientStockError(quote.shortages);

  let coupon: any = null;
  if (!isBlank(couponCode)) coupon = couponManager.check(user, couponCode, quote.subtotal);
  const discount = coupon ? coupon.discount : 0;
  const payable = quote.total - discount;
  const balance = await pointManager.confirmWithPartner(user.id);
  const pointProblem = checkUsePoints(usePoints, balance, payable);
  if (pointProblem) throw conflict(pointProblem.code, pointProblem.message);
  const paid = payable - usePoints;
  const rewardPoints = calcRewardPoints(paid);

  // 재고 검사는 위 quote 때가 아니라 이 트랜잭션 안(place)에서 다시 한다. 부족하면 모두 되돌린다.
  const result = tx(() => {
    const placed = services.orders.place(user, base);
    if (!placed.created) return { created: false, orderId: placed.order.id, at: "" };
    if (placed.order.total !== quote.total) throw conflict("PRICE_CHANGED", "상품 가격이 바뀌었어요. 주문서를 다시 확인해 주세요.");
    const at = placed.order.createdAt.toISOString();
    let couponId = null;
    if (coupon) couponId = couponManager.redeem(user, couponCode, quote.subtotal, placed.order.id, at).couponId;
    if (usePoints > 0) pointManager.use(user.id, usePoints, placed.order.id, payable, at);
    savePayment(placed.order.id, couponId, discount, usePoints, paid, rewardPoints, at);
    if (rewardPoints > 0) pointManager.earn(user.id, rewardPoints, placed.order.id, undefined, at);
    return { created: true, orderId: placed.order.id, at: at };
  });
  if (!result.created) return { created: false, orderId: result.orderId };
  emit("order.placed", { orderId: result.orderId, at: result.at });
  log("legacy_checkout", { orderId: result.orderId, coupon: coupon ? coupon.code : null, points: usePoints });
  return { created: true, orderId: result.orderId };
}
