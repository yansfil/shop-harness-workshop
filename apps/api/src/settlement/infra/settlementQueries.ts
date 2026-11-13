// 정산 조회 SQL
import { all, getDb, isBlank, one, run, str } from "../../legacy/legacyUtils.ts";

export type OrderSettlementRow = any;
export type ItemSettlementRow = any;

const ORDER_COLUMNS =
  "o.id, o.order_number, o.customer_id, o.status, o.subtotal, o.shipping_fee, o.total, o.created_at, " +
  "u.name AS customer_name, COALESCE(p.coupon_discount, 0) AS coupon_discount, COALESCE(p.point_used, 0) AS point_used, " +
  "COALESCE(p.paid_amount, o.total) AS paid_amount";

const ORDER_FROM = " FROM orders o JOIN users u ON u.id = o.customer_id LEFT JOIN order_payments p ON p.order_id = o.id";

/** 기간(from 이상 to 미만, ISO)과 검색어(주문번호·고객 이름)로 정산 대상 주문 조건을 만든다 */
export function settlementWhere(fromIso: string, toIso: string, keyword?: string): string {
  let sql = " WHERE o.status <> 'cancelled'";
  if (!isBlank(fromIso)) sql += " AND o.created_at >= '" + fromIso + "'";
  if (!isBlank(toIso)) sql += " AND o.created_at < '" + toIso + "'";
  if (!isBlank(keyword)) {
    const kw = str(keyword).trim();
    sql += " AND (o.order_number = '" + kw + "' OR u.name = '" + kw + "')";
  }
  return sql;
}

export function loadOrders(fromIso: string, toIso: string, keyword?: string): OrderSettlementRow[] {
  const sql = "SELECT " + ORDER_COLUMNS + ORDER_FROM + settlementWhere(fromIso, toIso, keyword) + " ORDER BY o.created_at, o.id";
  return getDb().prepare(sql).all();
}

export function loadItems(orderIds: number[]): ItemSettlementRow[] {
  if (orderIds.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < orderIds.length; i += 500) {
    const part = orderIds.slice(i, i + 500);
    const rows = getDb()
      .prepare("SELECT order_id, id, product_id, product_name, unit_price, quantity, line_total FROM order_items WHERE order_id IN (" + part.join(",") + ") ORDER BY order_id, id")
      .all();
    for (const r of rows) out.push(r);
  }
  return out;
}

/** 월별 합계. 쿠폰·포인트는 상품 줄 금액 비중대로 나눈 값을 그대로 더한다 */
export function monthlyItemSums(fromIso: string, toIso: string, keyword?: string): any[] {
  const sql =
    "SELECT substr(o.created_at, 1, 7) AS month, COUNT(DISTINCT o.id) AS order_count, SUM(i.line_total) AS goods, " +
    "SUM(COALESCE(p.coupon_discount, 0) * (i.line_total * 1.0 / o.subtotal)) AS coupon, " +
    "SUM(COALESCE(p.point_used, 0) * (i.line_total * 1.0 / o.subtotal)) AS point" +
    ORDER_FROM +
    " JOIN order_items i ON i.order_id = o.id" +
    settlementWhere(fromIso, toIso, keyword) +
    " GROUP BY substr(o.created_at, 1, 7) ORDER BY month DESC";
  return getDb().prepare(sql).all();
}

export function monthlyShipping(fromIso: string, toIso: string, keyword?: string): any[] {
  const sql =
    "SELECT substr(o.created_at, 1, 7) AS month, SUM(o.shipping_fee) AS shipping" +
    ORDER_FROM +
    settlementWhere(fromIso, toIso, keyword) +
    " GROUP BY substr(o.created_at, 1, 7)";
  return getDb().prepare(sql).all();
}

export function firstOrderAt(): string | null {
  const row = one("SELECT MIN(created_at) AS v FROM orders");
  return row && row.v ? String(row.v) : null;
}

export function lastOrderAt(): string | null {
  const row = one("SELECT MAX(created_at) AS v FROM orders");
  return row && row.v ? String(row.v) : null;
}

export function closedDays(fromDay: string, toDay: string): any[] {
  return all("SELECT * FROM settlement_daily WHERE day >= ? AND day <= ? ORDER BY day DESC", fromDay, toDay);
}

export function findClosedDay(day: string): any {
  return one("SELECT * FROM settlement_daily WHERE day = ?", day);
}

export function saveClosedDay(row: any): void {
  run("DELETE FROM settlement_daily WHERE day = ?", row.day);
  run(
    "INSERT INTO settlement_daily (day, order_count, goods_amount, shipping_amount, coupon_amount, point_amount, net_amount, closed_at, closed_by_run) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    row.day,
    row.order_count,
    row.goods_amount,
    row.shipping_amount,
    row.coupon_amount,
    row.point_amount,
    row.net_amount,
    row.closed_at,
    row.closed_by_run == null ? null : row.closed_by_run,
  );
}

export function countOrdersOnDay(day: string): number {
  const row = one("SELECT COUNT(*) AS n FROM orders WHERE substr(created_at, 1, 10) = ? AND status <> 'cancelled'", day);
  return row ? Number(row.n) : 0;
}
