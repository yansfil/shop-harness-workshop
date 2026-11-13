// 쿠폰 표 읽기·쓰기
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";

export function listCoupons(): any[] {
  return all("SELECT * FROM coupons ORDER BY ends_at DESC, id DESC");
}

export function findByCode(code: string): any {
  return one("SELECT * FROM coupons WHERE code = ?", code);
}

export function findById(id: any): any {
  return one("SELECT * FROM coupons WHERE id = ?", Number(id));
}

export function insertCoupon(row: any): number {
  return insert("coupons", row);
}

export function walletOf(userId: any): any[] {
  return all(
    "SELECT w.*, c.code, c.name, c.discount_amount, c.min_order_amount, c.starts_at, c.ends_at, c.issue_limit, c.issued_count, c.used_count " +
      "FROM coupon_wallet w JOIN coupons c ON c.id = w.coupon_id WHERE w.user_id = ? ORDER BY c.ends_at",
    Number(userId),
  );
}

export function findWallet(couponId: any, userId: any): any {
  return one("SELECT * FROM coupon_wallet WHERE coupon_id = ? AND user_id = ?", Number(couponId), Number(userId));
}

export function addToWallet(couponId: any, userId: any, at: string): number {
  const id = insert("coupon_wallet", { coupon_id: Number(couponId), user_id: Number(userId), received_at: at, used_at: null, order_id: null });
  run("UPDATE coupons SET issued_count = issued_count + 1 WHERE id = ?", Number(couponId));
  return id;
}

export function markWalletUsed(couponId: any, userId: any, orderId: any, at: string): void {
  run("UPDATE coupon_wallet SET used_at = ?, order_id = ? WHERE coupon_id = ? AND user_id = ?", at, Number(orderId), Number(couponId), Number(userId));
}

export function clearWalletUse(couponId: any, userId: any): void {
  run("UPDATE coupon_wallet SET used_at = NULL, order_id = NULL WHERE coupon_id = ? AND user_id = ?", Number(couponId), Number(userId));
}

export function insertRedemption(row: any): number {
  const id = insert("coupon_redemptions", row);
  run("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?", Number(row.coupon_id));
  return id;
}

export function findRedemptionForOrder(orderId: any): any {
  return one("SELECT * FROM coupon_redemptions WHERE order_id = ? AND state = 'used'", Number(orderId));
}

export function restoreRedemption(id: any, at: string): void {
  const row = one("SELECT * FROM coupon_redemptions WHERE id = ?", Number(id));
  if (!row) return;
  run("UPDATE coupon_redemptions SET state = 'restored', restored_at = ? WHERE id = ?", at, Number(id));
  run("UPDATE coupons SET used_count = used_count - 1 WHERE id = ? AND used_count > 0", Number(row.coupon_id));
}

export function usedBy(couponId: any, userId: any): boolean {
  const row = one("SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ? AND state = 'used'", Number(couponId), Number(userId));
  return !!row;
}

export function customerIds(): number[] {
  return all("SELECT id FROM users WHERE role = 'customer' ORDER BY id").map((r: any) => Number(r.id));
}

export function redemptionsOf(couponId: any): any[] {
  return all(
    "SELECT r.*, o.order_number, u.name AS customer_name, u.email AS customer_email FROM coupon_redemptions r " +
      "JOIN orders o ON o.id = r.order_id JOIN users u ON u.id = r.user_id WHERE r.coupon_id = ? ORDER BY r.created_at DESC",
    Number(couponId),
  );
}
