// 배송 표
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";
import { SHIPMENT_STATES } from "../deliveryManager.ts";

export function findByOrder(orderId: any): any {
  return one("SELECT * FROM shipments WHERE order_id = ?", Number(orderId));
}

export function findByTrackingNo(trackingNo: string): any {
  return one("SELECT * FROM shipments WHERE tracking_no = ?", trackingNo);
}

export function insertShipment(row: any): number {
  return insert("shipments", { ...row, state: row.state || SHIPMENT_STATES.REGISTERED });
}

export function markDelivered(id: any, atIso: string): void {
  run("UPDATE shipments SET state = ?, delivered_at = ?, last_synced_at = ? WHERE id = ?", SHIPMENT_STATES.DELIVERED, atIso, atIso, Number(id));
}

export function markInTransit(id: any, atIso: string): void {
  run("UPDATE shipments SET state = ?, last_synced_at = ? WHERE id = ? AND state = ?", SHIPMENT_STATES.IN_TRANSIT, atIso, Number(id), SHIPMENT_STATES.REGISTERED);
}

export function undelivered(): any[] {
  return all("SELECT * FROM shipments WHERE state <> ? ORDER BY registered_at", SHIPMENT_STATES.DELIVERED);
}

export function lastTrackingSeq(courierCode: string): number {
  const row = one("SELECT tracking_no FROM shipments WHERE courier_code = ? ORDER BY id DESC LIMIT 1", courierCode);
  if (!row) return 0;
  return Number(String(row.tracking_no).replace(/\D/g, ""));
}

const BOARD_COLUMNS =
  "o.id AS order_id, o.order_number, o.status, o.created_at, o.updated_at, u.name AS customer_name, u.email AS customer_email, " +
  "s.id AS shipment_id, s.courier_code, s.tracking_no, s.registered_at, s.delivered_at, " +
  "(SELECT product_name FROM order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS first_item, " +
  "(SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count";

export function boardRows(orderStatus: string, limit: number): any[] {
  const order = orderStatus === "preparing" ? "o.created_at DESC" : orderStatus === "shipping" ? "s.registered_at DESC" : "s.delivered_at DESC";
  return all(
    "SELECT " +
      BOARD_COLUMNS +
      " FROM orders o JOIN users u ON u.id = o.customer_id LEFT JOIN shipments s ON s.order_id = o.id WHERE o.status = ? ORDER BY " +
      order +
      ", o.id DESC LIMIT ?",
    orderStatus,
    limit,
  );
}

export function statusCounts(): any {
  const rows = all("SELECT status, COUNT(*) AS n FROM orders WHERE status IN ('preparing', 'shipping', 'delivered') GROUP BY status");
  const out: any = { preparing: 0, shipping: 0, delivered: 0 };
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}

export function recentlyRegistered(sinceIso: string): any[] {
  return all(
    "SELECT " + BOARD_COLUMNS + " FROM shipments s JOIN orders o ON o.id = s.order_id JOIN users u ON u.id = o.customer_id WHERE s.registered_at >= ? ORDER BY s.registered_at DESC",
    sinceIso,
  );
}

/** 결제·배송준비 상태로 오래 머문 주문 (송장 없음) */
export function waitingOrders(beforeIso: string, limit: number): any[] {
  return all(
    "SELECT o.id, o.order_number, o.status, o.created_at, u.name AS customer_name, u.email AS customer_email FROM orders o JOIN users u ON u.id = o.customer_id " +
      "LEFT JOIN shipments s ON s.order_id = o.id WHERE o.status IN ('paid', 'preparing') AND s.id IS NULL AND o.created_at < ? ORDER BY o.created_at LIMIT ?",
    beforeIso,
    limit,
  );
}

/** 등록한 지 오래됐는데 아직 도착하지 않은 송장 */
export function lateShipments(beforeIso: string, limit: number): any[] {
  return all(
    "SELECT s.*, o.order_number, u.name AS customer_name, u.email AS customer_email FROM shipments s JOIN orders o ON o.id = s.order_id JOIN users u ON u.id = o.customer_id " +
      "WHERE s.delivered_at IS NULL AND s.registered_at < ? ORDER BY s.registered_at LIMIT ?",
    beforeIso,
    limit,
  );
}

/** 택배사별 건수와 평균 배송 시간(분) */
export function courierSums(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT courier_code, COUNT(*) AS n, SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) AS delivered, " +
      "AVG(CASE WHEN delivered_at IS NOT NULL THEN (julianday(delivered_at) - julianday(registered_at)) * 1440 END) AS avg_minutes " +
      "FROM shipments WHERE registered_at >= ? AND registered_at < ? GROUP BY courier_code ORDER BY courier_code",
    fromIso,
    toIso,
  );
}

export function shipmentsBetween(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT s.*, o.order_number, o.recipient_name, o.shipping_address FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.registered_at >= ? AND s.registered_at < ? ORDER BY s.registered_at, s.id",
    fromIso,
    toIso,
  );
}
