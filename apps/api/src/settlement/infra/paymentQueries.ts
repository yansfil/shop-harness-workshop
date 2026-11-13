// 결제 내역 조회 SQL: 조건이 많아 WHERE를 조각으로 붙인다. 값은 ?로 넘긴다.
import { all, one } from "../../legacy/legacyUtils.ts";

export function buildWhere(f: any): any {
  const parts: string[] = ["o.created_at >= ?", "o.created_at < ?"];
  const args: any[] = [f.fromIso, f.toIso];
  if (f.status) {
    parts.push("o.status = ?");
    args.push(f.status);
  }
  if (f.coupon === "yes") parts.push("COALESCE(p.coupon_discount, 0) <> 0");
  if (f.coupon === "no") parts.push("COALESCE(p.coupon_discount, 0) = 0");
  if (f.points === "yes") parts.push("COALESCE(p.point_used, 0) > 0");
  if (f.points === "no") parts.push("COALESCE(p.point_used, 0) = 0");
  if (f.refund) {
    parts.push("COALESCE(p.refund_status, 'none') = ?");
    args.push(f.refund);
  }
  if (f.minAmount != null) {
    parts.push("o.total >= ?");
    args.push(f.minAmount);
  }
  if (f.maxAmount != null) {
    parts.push("o.total <= ?");
    args.push(f.maxAmount);
  }
  if (f.email) {
    parts.push("lower(u.email) LIKE ?");
    args.push("%" + String(f.email).toLowerCase() + "%");
  }
  return { sql: " WHERE " + parts.join(" AND "), args: args };
}

const FROM =
  " FROM orders o JOIN users u ON u.id = o.customer_id LEFT JOIN order_payments p ON p.order_id = o.id LEFT JOIN coupons c ON c.id = p.coupon_id";

export function countPayments(f: any): any {
  const w = buildWhere(f);
  return one(
    "SELECT COUNT(*) AS n, SUM(o.total) AS total, SUM(COALESCE(p.coupon_discount, 0)) AS coupon, SUM(COALESCE(p.point_used, 0)) AS points, " +
      "SUM(COALESCE(p.paid_amount, o.total)) AS paid, SUM(COALESCE(p.refunded_amount, 0)) AS refunded, SUM(COALESCE(p.reward_points, 0)) AS reward" +
      FROM +
      w.sql,
    ...w.args,
  );
}

export function listPayments(f: any, limit: number, offset: number): any[] {
  const w = buildWhere(f);
  return all(
    "SELECT o.id, o.order_number, o.status, o.total, o.created_at, u.email, u.name, c.code AS coupon_code, COALESCE(p.coupon_discount, 0) AS coupon_discount, " +
      "COALESCE(p.point_used, 0) AS point_used, COALESCE(p.paid_amount, o.total) AS paid_amount, COALESCE(p.reward_points, 0) AS reward_points, " +
      "COALESCE(p.refunded_amount, 0) AS refunded_amount, COALESCE(p.refund_status, 'none') AS refund_status" +
      FROM +
      w.sql +
      " ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?",
    ...w.args,
    limit,
    offset,
  );
}
