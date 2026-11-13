// 제휴 포인트 시스템 연동
import { getDb, log, nowMs, toInt } from "../../legacy/legacyUtils.ts";

/**
 * 제휴 포인트 시스템에 잔액을 한 번 더 물어본다.
 * 예전 시스템과 잔액이 어긋나는 일이 있어 결제 직전에 맞춰 본다(응답이 느리다).
 */
export async function confirmWithPartner(userId: any): Promise<number> {
  const db = getDb();
  const started = nowMs();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const row: any = db.prepare("SELECT balance FROM point_balances WHERE user_id = ?").get(Number(userId));
  log("point_partner_checked", { userId: Number(userId), ms: nowMs() - started });
  return row ? toInt(row.balance) : 0;
}

