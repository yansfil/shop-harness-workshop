// 결제: 쿠폰·포인트를 쓰는 주문은 예전 결제 흐름으로, 그 밖의 주문은 주문 서비스로 보낸다.
import { CreateOrderRequestSchema } from "@grabmarket/contracts";
import {
  LegacyError,
  conflict,
  emit,
  getDb,
  getServices,
  insert,
  isBlank,
  log,
  one,
  run,
  toInt,
  trim,
  tx,
  ymdCompact,
} from "../../legacy/legacyUtils.ts";
import { SqliteInventoryRepository } from "../../inventory/infra/sqlite-inventory-repository.ts";
import { InsufficientStockError } from "../../inventory/domain/stock.ts";
import { formatOrderNumber } from "../../orders/domain/order.ts";
import * as couponManager from "../../coupons/couponManager.ts";
import * as pointManager from "../../points/pointManager.ts";
import { checkUsePoints } from "../../points/domain/pointPolicy.ts";

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
  const rewardPoints = toInt(body.rewardPoints);
  const services = getServices();

  if (isBlank(couponCode) && usePoints === 0) {
    const placed = services.orders.place(user, base);
    if (placed.created) {
      const at = placed.order.createdAt.toISOString();
      tx(() => {
        savePayment(placed.order.id, null, 0, 0, placed.order.total, rewardPoints, at);
        if (rewardPoints > 0) pointManager.earn(user.id, rewardPoints, placed.order.id, undefined, at);
      });
      emit("order.placed", { orderId: placed.order.id, at: at });
    }
    return { created: placed.created, orderId: placed.order.id };
  }

  const existing = findExisting(user.id, base.idempotencyKey);
  if (existing) return { created: false, orderId: existing.id };

  const quote = services.orders.quote(base.items);
  const repo = new SqliteInventoryRepository(getDb());
  const stock = repo.quantities(base.items.map((line) => line.productId));
  const shortages: any[] = [];
  for (const item of quote.items) {
    const available = stock.get(item.productId) || 0;
    if (available < item.quantity) shortages.push({ productId: item.productId, productName: item.productName, requested: item.quantity, available: available });
  }
  if (shortages.length > 0) throw new InsufficientStockError(shortages);

  let coupon: any = null;
  if (!isBlank(couponCode)) coupon = couponManager.check(user, couponCode, quote.subtotal);
  const discount = coupon ? coupon.discount : 0;
  const payable = quote.total - discount;
  const balance = await pointManager.confirmWithPartner(user.id);
  const pointProblem = checkUsePoints(usePoints, balance, payable);
  if (pointProblem) throw conflict(pointProblem.code, pointProblem.message);
  const paid = payable - usePoints;

  const result = tx(() => {
    const created = new Date();
    const at = created.toISOString();
    const dayCount = one("SELECT COUNT(*) AS n FROM orders WHERE order_number LIKE ?", "GM-" + ymdCompact(created) + "-%");
    const orderNumber = formatOrderNumber(created, Number(dayCount.n) + 1);
    const orderId = insert("orders", {
      order_number: orderNumber,
      customer_id: user.id,
      status: "paid",
      subtotal: quote.subtotal,
      shipping_fee: quote.shippingFee,
      total: quote.total,
      payment_method: base.paymentMethod,
      recipient_name: base.shipping.recipientName,
      recipient_phone: base.shipping.phone,
      shipping_address: base.shipping.address,
      idempotency_key: base.idempotencyKey,
      created_at: at,
      updated_at: at,
    });
    for (const item of quote.items) {
      insert("order_items", {
        order_id: orderId,
        product_id: item.productId,
        product_name: item.productName,
        unit_price: item.unitPrice,
        quantity: item.quantity,
        line_total: item.lineTotal,
      });
      run("UPDATE inventory SET quantity = quantity - ?, updated_at = ? WHERE product_id = ?", item.quantity, at, item.productId);
      insert("inventory_movements", {
        product_id: item.productId,
        kind: "outbound",
        quantity_delta: -item.quantity,
        quantity_after: (stock.get(item.productId) || 0) - item.quantity,
        order_id: orderId,
        memo: null,
        idempotency_key: null,
        created_by: null,
        created_at: at,
      });
    }
    let couponId = null;
    if (coupon) couponId = couponManager.redeem(user, couponCode, quote.subtotal, orderId, at).couponId;
    if (usePoints > 0) pointManager.use(user.id, usePoints, orderId, payable, at);
    savePayment(orderId, couponId, discount, usePoints, paid, rewardPoints, at);
    if (rewardPoints > 0) pointManager.earn(user.id, rewardPoints, orderId, undefined, at);
    return { orderId: orderId, at: at };
  });
  emit("order.placed", { orderId: result.orderId, at: result.at });
  log("legacy_checkout", { orderId: result.orderId, coupon: coupon ? coupon.code : null, points: usePoints });
  return { created: true, orderId: result.orderId };
}
