// 교환 재발송 송장 SQL
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";

export function findByReturn(returnId: any): any {
  return one("SELECT * FROM return_shipments WHERE return_id = ?", Number(returnId));
}

export function findByTrackingNo(trackingNo: string): any {
  const a = one("SELECT id FROM return_shipments WHERE tracking_no = ?", trackingNo);
  if (a) return a;
  return one("SELECT id FROM shipments WHERE tracking_no = ?", trackingNo);
}

export function insertReship(row: any): number {
  return insert("return_shipments", row);
}

export function markDelivered(id: any, atIso: string): void {
  run("UPDATE return_shipments SET delivered_at = ? WHERE id = ?", atIso, Number(id));
}

export function undelivered(): any[] {
  return all("SELECT * FROM return_shipments WHERE delivered_at IS NULL ORDER BY registered_at");
}

/** 승인됐는데 아직 다시 보내지 않은 교환 */
export function approvedWithoutReship(limit: number): any[] {
  return all(
    "SELECT r.*, o.order_number, u.name AS user_name, u.email AS user_email FROM return_requests r JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = r.user_id " +
      "LEFT JOIN return_shipments s ON s.return_id = r.id WHERE r.kind = 'exchange' AND r.state = 'approved' AND s.id IS NULL ORDER BY r.decided_at LIMIT ?",
    limit,
  );
}

/** 사유별 건수 (기간 안 신청) */
export function reasonCounts(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT reason_code, kind, state, COUNT(*) AS n, SUM(refund_amount) AS amount FROM return_requests WHERE created_at >= ? AND created_at < ? GROUP BY reason_code, kind, state",
    fromIso,
    toIso,
  );
}

/** 반품이 많은 상품 */
export function productCounts(fromIso: string, toIso: string, limit: number): any[] {
  return all(
    "SELECT i.product_id, i.product_name, COUNT(DISTINCT r.id) AS requests, SUM(i.quantity) AS quantity FROM return_requests r JOIN return_request_items i ON i.return_id = r.id " +
      "WHERE r.created_at >= ? AND r.created_at < ? GROUP BY i.product_id ORDER BY requests DESC, quantity DESC LIMIT ?",
    fromIso,
    toIso,
    limit,
  );
}

/** 처리까지 걸린 시간(시간 단위 평균) */
export function averageDecisionHours(fromIso: string, toIso: string): number | null {
  const row = one(
    "SELECT AVG((julianday(decided_at) - julianday(created_at)) * 24) AS h FROM return_requests WHERE decided_at IS NOT NULL AND created_at >= ? AND created_at < ?",
    fromIso,
    toIso,
  );
  return row && row.h != null ? Number(row.h) : null;
}
