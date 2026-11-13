// 배송지 변경 기록 SQL
import { all, insert, run } from "../../legacy/legacyUtils.ts";

export function insertChange(row: any): number {
  return insert("order_address_changes", row);
}

export function changesOf(orderId: any): any[] {
  return all(
    "SELECT c.*, u.name AS changed_by_name, u.role AS changed_by_role FROM order_address_changes c LEFT JOIN users u ON u.id = c.changed_by WHERE c.order_id = ? ORDER BY c.created_at DESC, c.id DESC",
    Number(orderId),
  );
}

export function updateOrderAddress(orderId: any, name: string, phone: string, address: string, atIso: string): number {
  return Number(
    run("UPDATE orders SET recipient_name = ?, recipient_phone = ?, shipping_address = ?, updated_at = ? WHERE id = ?", name, phone, address, atIso, Number(orderId)).changes,
  );
}

export function recentChanges(sinceIso: string, limit: number): any[] {
  return all(
    "SELECT c.*, o.order_number FROM order_address_changes c JOIN orders o ON o.id = c.order_id WHERE c.created_at >= ? ORDER BY c.created_at DESC LIMIT ?",
    sinceIso,
    limit,
  );
}
