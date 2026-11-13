// 포인트 표 읽기·쓰기
import { all, getDb, insert, nowIso, one, run } from "../../legacy/legacyUtils.ts";

export function findBalance(userId: any): any {
  return one("SELECT * FROM point_balances WHERE user_id = ?", Number(userId));
}

export function saveBalance(userId: any, balance: number, at?: string): void {
  const exists = findBalance(userId);
  if (exists) {
    run("UPDATE point_balances SET balance = ?, updated_at = ? WHERE user_id = ?", balance, at || nowIso(), Number(userId));
  } else {
    run("INSERT INTO point_balances (user_id, balance, updated_at) VALUES (?, ?, ?)", Number(userId), balance, at || nowIso());
  }
}

export function insertLedger(row: any): number {
  return insert("point_ledger", row);
}

export function listLedger(userId: any, limit?: number): any[] {
  let sql =
    "SELECT l.*, o.order_number FROM point_ledger l LEFT JOIN orders o ON o.id = l.order_id WHERE l.user_id = " +
    Number(userId) +
    " ORDER BY l.created_at DESC, l.id DESC";
  if (limit) sql += " LIMIT " + Number(limit);
  return getDb().prepare(sql).all();
}

export function listLedgerForOrder(orderId: any): any[] {
  return all("SELECT * FROM point_ledger WHERE order_id = ? ORDER BY id", Number(orderId));
}

export function findExpirable(beforeIso: string): any[] {
  return all(
    "SELECT * FROM point_ledger WHERE kind = 'earn' AND expired = 0 AND expires_at IS NOT NULL AND expires_at <= ? ORDER BY user_id, created_at",
    beforeIso,
  );
}

export function markExpired(ledgerId: any): void {
  run("UPDATE point_ledger SET expired = 1 WHERE id = ?", Number(ledgerId));
}

export function sumByKind(userId: any): any {
  const rows = all("SELECT kind, SUM(amount) AS total, COUNT(*) AS n FROM point_ledger WHERE user_id = ? GROUP BY kind", Number(userId));
  const out: any = {};
  for (const r of rows) out[r.kind] = { total: Number(r.total), count: Number(r.n) };
  return out;
}

export function topHolders(limit: number): any[] {
  return all(
    "SELECT b.user_id, b.balance, u.name, u.email FROM point_balances b JOIN users u ON u.id = b.user_id ORDER BY b.balance DESC LIMIT ?",
    limit,
  );
}

export function totalOutstanding(): number {
  const row = one("SELECT SUM(balance) AS s FROM point_balances");
  return row && row.s ? Number(row.s) : 0;
}
