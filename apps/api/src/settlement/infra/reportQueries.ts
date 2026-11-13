// 정산 항목별 집계와 정산 조정 SQL
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";

const LIVE = " o.status <> 'cancelled' AND o.created_at >= ? AND o.created_at < ?";

/** 카테고리별 상품 매출과 수량 */
export function categorySums(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT c.id AS category_id, c.name AS category_name, c.sort_order, COUNT(DISTINCT o.id) AS order_count, SUM(i.quantity) AS quantity, SUM(i.line_total) AS goods " +
      "FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id " +
      "WHERE" +
      LIVE +
      " GROUP BY c.id ORDER BY c.sort_order",
    fromIso,
    toIso,
  );
}

/** 많이 팔린 상품 */
export function productSums(fromIso: string, toIso: string, limit: number): any[] {
  return all(
    "SELECT i.product_id, i.product_name, c.name AS category_name, COUNT(DISTINCT o.id) AS order_count, SUM(i.quantity) AS quantity, SUM(i.line_total) AS goods " +
      "FROM orders o JOIN order_items i ON i.order_id = o.id JOIN products p ON p.id = i.product_id JOIN categories c ON c.id = p.category_id " +
      "WHERE" +
      LIVE +
      " GROUP BY i.product_id ORDER BY goods DESC, i.product_id LIMIT ?",
    fromIso,
    toIso,
    limit,
  );
}

/** 쿠폰별 사용 건수와 할인액 */
export function couponSums(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT cp.id AS coupon_id, cp.code, cp.name, COUNT(*) AS uses, SUM(pay.coupon_discount) AS discount, SUM(o.total) AS order_total " +
      "FROM orders o JOIN order_payments pay ON pay.order_id = o.id JOIN coupons cp ON cp.id = pay.coupon_id " +
      "WHERE" +
      LIVE +
      " GROUP BY cp.id ORDER BY discount DESC",
    fromIso,
    toIso,
  );
}

/** 포인트 흐름: 종류별 합계 */
export function pointFlows(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT kind, COUNT(*) AS count, SUM(amount) AS amount FROM point_ledger WHERE created_at >= ? AND created_at < ? GROUP BY kind",
    fromIso,
    toIso,
  );
}

/** 남아 있는 포인트 총액(회사가 갚을 돈) */
export function pointOutstanding(): number {
  const row = one("SELECT SUM(balance) AS v FROM point_balances");
  return row && row.v ? Number(row.v) : 0;
}

/** 시간대별 주문 수 (UTC 시각) */
export function hourlyCounts(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT CAST(substr(o.created_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS order_count, SUM(o.total) AS total FROM orders o WHERE" +
      LIVE +
      " GROUP BY hour ORDER BY hour",
    fromIso,
    toIso,
  );
}

/** 기간 안 주문 요약 */
export function orderSummary(fromIso: string, toIso: string): any {
  return one(
    "SELECT COUNT(*) AS order_count, COUNT(DISTINCT o.customer_id) AS customer_count, SUM(o.total) AS total, SUM(o.subtotal) AS goods, " +
      "SUM(COALESCE(pay.paid_amount, o.total)) AS paid FROM orders o LEFT JOIN order_payments pay ON pay.order_id = o.id WHERE" +
      LIVE,
    fromIso,
    toIso,
  );
}

/** 기간 안 취소·환불 */
export function refundSummary(fromIso: string, toIso: string): any {
  const cancelled = one(
    "SELECT COUNT(*) AS n, SUM(COALESCE(pay.refunded_amount, o.total)) AS amount FROM order_cancellations oc JOIN orders o ON o.id = oc.order_id " +
      "LEFT JOIN order_payments pay ON pay.order_id = o.id WHERE oc.created_at >= ? AND oc.created_at < ?",
    fromIso,
    toIso,
  );
  const returned = one(
    "SELECT COUNT(*) AS n, SUM(refund_amount) AS amount FROM return_requests WHERE state = 'approved' AND kind = 'return' AND decided_at >= ? AND decided_at < ?",
    fromIso,
    toIso,
  );
  return {
    cancelCount: Number(cancelled.n || 0),
    cancelAmount: Number(cancelled.amount || 0),
    returnCount: Number(returned.n || 0),
    returnAmount: Number(returned.amount || 0),
  };
}

/* 정산 조정 ------------------------------------------------------------ */

export function listAdjustments(fromDay: string, toDay: string): any[] {
  return all(
    "SELECT a.*, u.name AS created_by_name FROM settlement_adjustments a LEFT JOIN users u ON u.id = a.created_by WHERE a.day >= ? AND a.day <= ? ORDER BY a.day DESC, a.id DESC",
    fromDay,
    toDay,
  );
}

export function findAdjustment(id: number): any {
  return one("SELECT * FROM settlement_adjustments WHERE id = ?", id);
}

export function insertAdjustment(row: any): number {
  return insert("settlement_adjustments", row);
}

export function cancelAdjustment(id: number, at: string): number {
  return Number(run("UPDATE settlement_adjustments SET cancelled_at = ? WHERE id = ? AND cancelled_at IS NULL", at, id).changes);
}

export function adjustmentSumByDay(fromDay: string, toDay: string): any {
  const rows = all(
    "SELECT day, SUM(amount) AS amount, COUNT(*) AS n FROM settlement_adjustments WHERE cancelled_at IS NULL AND day >= ? AND day <= ? GROUP BY day",
    fromDay,
    toDay,
  );
  const out: any = {};
  for (const r of rows) out[r.day] = { amount: Number(r.amount || 0), count: Number(r.n || 0) };
  return out;
}
