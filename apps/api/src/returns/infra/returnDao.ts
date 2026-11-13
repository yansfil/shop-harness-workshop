// 반품·교환 표
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";

export function insertRequest(row: any): number {
  return insert("return_requests", row);
}

export function insertItem(row: any): number {
  return insert("return_request_items", row);
}

export function findRequest(id: any): any {
  return one(
    "SELECT r.*, o.order_number, u.name AS user_name, u.email AS user_email FROM return_requests r JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = r.user_id WHERE r.id = ?",
    Number(id),
  );
}

export function itemsOf(returnId: any): any[] {
  return all(
    "SELECT ri.*, p.image_path FROM return_request_items ri JOIN products p ON p.id = ri.product_id WHERE ri.return_id = ? ORDER BY ri.id",
    Number(returnId),
  );
}

export function itemsOfMany(returnIds: number[]): any[] {
  if (returnIds.length === 0) return [];
  return all(
    "SELECT ri.*, p.image_path FROM return_request_items ri JOIN products p ON p.id = ri.product_id WHERE ri.return_id IN (" +
      returnIds.map(() => "?").join(",") +
      ") ORDER BY ri.id",
    ...returnIds,
  );
}

export function listByUser(userId: any): any[] {
  return all(
    "SELECT r.*, o.order_number FROM return_requests r JOIN orders o ON o.id = r.order_id WHERE r.user_id = ? ORDER BY r.created_at DESC, r.id DESC",
    Number(userId),
  );
}

export function listByState(state: string, limit: number): any[] {
  return all(
    "SELECT r.*, o.order_number, u.name AS user_name, u.email AS user_email FROM return_requests r JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = r.user_id WHERE r.state = ? ORDER BY " +
      (state === "requested" ? "r.created_at DESC" : "r.decided_at DESC") +
      ", r.id DESC LIMIT ?",
    state,
    limit,
  );
}

export function countByState(): any {
  const rows = all("SELECT state, COUNT(*) AS n FROM return_requests GROUP BY state");
  const out: any = { requested: 0, approved: 0, rejected: 0 };
  for (const r of rows) out[r.state] = Number(r.n);
  return out;
}

export function decide(id: any, state: string, adminId: any, atIso: string, rejectReason: any): void {
  run("UPDATE return_requests SET state = ?, decided_by = ?, decided_at = ?, reject_reason = ? WHERE id = ?", state, adminId, atIso, rejectReason, Number(id));
}

/** 이미 신청 중이거나 승인된 수량 (주문 품목별) */
export function requestedQuantities(orderId: any): any {
  const rows = all(
    "SELECT ri.order_item_id, SUM(ri.quantity) AS qty FROM return_request_items ri JOIN return_requests r ON r.id = ri.return_id WHERE r.order_id = ? AND r.state IN ('requested', 'approved') GROUP BY ri.order_item_id",
    Number(orderId),
  );
  const out: any = {};
  for (const r of rows) out[r.order_item_id] = Number(r.qty);
  return out;
}

export function lastRequestNo(): string | null {
  const row = one("SELECT request_no FROM return_requests ORDER BY id DESC LIMIT 1");
  return row ? String(row.request_no) : null;
}

export function deliveredOrdersOf(userId: any, sinceIso: string): any[] {
  return all(
    "SELECT o.*, COALESCE(s.delivered_at, o.updated_at) AS delivered_at FROM orders o LEFT JOIN shipments s ON s.order_id = o.id " +
      "WHERE o.customer_id = ? AND o.status = 'delivered' AND COALESCE(s.delivered_at, o.updated_at) >= ? ORDER BY COALESCE(s.delivered_at, o.updated_at) DESC",
    Number(userId),
    sinceIso,
  );
}

export function deliveredAtOf(orderId: any): string | null {
  const row = one(
    "SELECT COALESCE(s.delivered_at, o.updated_at) AS delivered_at, o.status FROM orders o LEFT JOIN shipments s ON s.order_id = o.id WHERE o.id = ?",
    Number(orderId),
  );
  if (!row || row.status !== "delivered") return null;
  return String(row.delivered_at);
}

export function addRefund(orderId: any, amount: number, atIso: string): void {
  const pay = one("SELECT * FROM order_payments WHERE order_id = ?", Number(orderId));
  if (!pay) {
    const order = one("SELECT * FROM orders WHERE id = ?", Number(orderId));
    if (!order) return;
    insert("order_payments", {
      order_id: Number(orderId),
      coupon_id: null,
      coupon_discount: 0,
      point_used: 0,
      paid_amount: order.total,
      reward_points: 0,
      refunded_amount: amount,
      refund_status: amount >= order.total ? "full" : "partial",
      created_at: order.created_at,
      updated_at: atIso,
    });
    return;
  }
  const refunded = Number(pay.refunded_amount) + amount;
  run(
    "UPDATE order_payments SET refunded_amount = ?, refund_status = ?, updated_at = ? WHERE order_id = ?",
    refunded,
    refunded >= Number(pay.paid_amount) ? "full" : "partial",
    atIso,
    Number(orderId),
  );
}
