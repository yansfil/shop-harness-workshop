// 포인트 지급 행사·소멸 예정 SQL
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";

export function insertCampaign(row: any): number {
  return insert("point_campaigns", row);
}

export function finishCampaign(id: number, memberCount: number, totalPoints: number, skipped: string | null): void {
  run("UPDATE point_campaigns SET member_count = ?, total_points = ?, skipped = ? WHERE id = ?", memberCount, totalPoints, skipped, id);
}

export function listCampaigns(limit: number): any[] {
  return all(
    "SELECT c.*, u.name AS created_by_name FROM point_campaigns c LEFT JOIN users u ON u.id = c.created_by ORDER BY c.created_at DESC, c.id DESC LIMIT ?",
    limit,
  );
}

export function findCampaign(id: number): any {
  return one("SELECT * FROM point_campaigns WHERE id = ?", id);
}

export function allCustomers(): any[] {
  return all("SELECT id, email, name FROM users WHERE role = 'customer' ORDER BY id");
}

export function customersByEmail(emails: string[]): any[] {
  if (emails.length === 0) return [];
  const marks = emails.map(() => "?").join(", ");
  return all("SELECT id, email, name FROM users WHERE role = 'customer' AND lower(email) IN (" + marks + ")", ...emails.map((e) => e.toLowerCase()));
}

/** 아직 소멸하지 않은 적립분 (소멸일 순) */
export function upcomingExpiries(userId: any, fromIso: string): any[] {
  return all(
    "SELECT id, amount, expires_at, memo, order_id, created_at FROM point_ledger WHERE user_id = ? AND kind = 'earn' AND expired = 0 AND expires_at IS NOT NULL AND expires_at > ? ORDER BY expires_at, id",
    Number(userId),
    fromIso,
  );
}

/** 기간 안에 소멸할 적립분이 있는 고객별 합계 */
export function expiringByUser(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT l.user_id, SUM(l.amount) AS amount, MIN(l.expires_at) AS first_at, b.balance FROM point_ledger l JOIN point_balances b ON b.user_id = l.user_id " +
      "WHERE l.kind = 'earn' AND l.expired = 0 AND l.expires_at > ? AND l.expires_at <= ? GROUP BY l.user_id ORDER BY l.user_id",
    fromIso,
    toIso,
  );
}

/** 관리자 내역 CSV용: 기간 안 원장 */
export function ledgerBetween(fromIso: string, toIso: string): any[] {
  return all(
    "SELECT l.*, u.email, u.name, o.order_number FROM point_ledger l JOIN users u ON u.id = l.user_id LEFT JOIN orders o ON o.id = l.order_id " +
      "WHERE l.created_at >= ? AND l.created_at < ? ORDER BY l.created_at, l.id",
    fromIso,
    toIso,
  );
}

/** 관리자 고객 찾기: 이메일·이름 일부 */
export function searchMembers(keyword: string, limit: number): any[] {
  const like = "%" + keyword.toLowerCase() + "%";
  return all(
    "SELECT u.id, u.email, u.name, COALESCE(b.balance, 0) AS balance, (SELECT MAX(created_at) FROM point_ledger l WHERE l.user_id = u.id) AS last_at " +
      "FROM users u LEFT JOIN point_balances b ON b.user_id = u.id WHERE u.role = 'customer' AND (lower(u.email) LIKE ? OR lower(u.name) LIKE ?) ORDER BY u.id LIMIT ?",
    like,
    like,
    limit,
  );
}
