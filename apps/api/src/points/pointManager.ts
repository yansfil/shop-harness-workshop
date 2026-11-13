// 포인트 적립·사용·환불·소멸
import { log, nowIso, toInt, tx, conflict, badRequest, loadUser, emit, fmtMdHm } from "../legacy/legacyUtils.ts";
import * as dao from "./infra/pointDao.ts";
export { confirmWithPartner } from "./application/partnerPointClient.ts";
import { checkUsePoints, expiresAtFor, kindText, ledgerDescription, signedAmount } from "./domain/pointPolicy.ts";

export function getBalance(userId: any): number {
  const row = dao.findBalance(userId);
  if (!row) return 0;
  return toInt(row.balance);
}

function changeBalance(userId: any, delta: number, at: string): number {
  const current = getBalance(userId);
  const next = current + delta;
  dao.saveBalance(userId, next, at);
  return next;
}

/** 적립. 1년 뒤 소멸 예정일을 같이 적는다 */
export function earn(userId: any, amount: any, orderId: any, memo?: string, at?: string): any {
  const points = toInt(amount);
  if (points === 0) return null;
  const when = at || nowIso();
  return tx(() => {
    const after = changeBalance(userId, points, when);
    const id = dao.insertLedger({
      user_id: Number(userId),
      kind: "earn",
      amount: points,
      balance_after: after,
      order_id: orderId == null ? null : Number(orderId),
      memo: memo || null,
      expires_at: expiresAtFor(when),
      expired: 0,
      created_at: when,
    });
    log("points_earned", { userId: Number(userId), orderId: orderId, points: points });
    return { id: id, balance: after };
  });
}

/** 사용. 보유분과 결제 금액을 넘지 않는지 검사한다 */
export function use(userId: any, amount: any, orderId: any, payable: any, at?: string): any {
  const points = toInt(amount);
  if (points === 0) return null;
  const when = at || nowIso();
  return tx(() => {
    const balance = getBalance(userId);
    const problem = checkUsePoints(points, balance, payable);
    if (problem) throw conflict(problem.code, problem.message);
    const after = changeBalance(userId, -points, when);
    const id = dao.insertLedger({
      user_id: Number(userId),
      kind: "use",
      amount: -points,
      balance_after: after,
      order_id: orderId == null ? null : Number(orderId),
      memo: null,
      expires_at: null,
      expired: 0,
      created_at: when,
    });
    log("points_used", { userId: Number(userId), orderId: orderId, points: points });
    return { id: id, balance: after };
  });
}

/** 주문 취소·반품으로 쓴 포인트를 돌려준다 */
export function refund(userId: any, amount: any, orderId: any, memo?: string, at?: string): any {
  const points = toInt(amount);
  if (points <= 0) return null;
  const when = at || nowIso();
  return tx(() => {
    const after = changeBalance(userId, points, when);
    const id = dao.insertLedger({
      user_id: Number(userId),
      kind: "refund",
      amount: points,
      balance_after: after,
      order_id: orderId == null ? null : Number(orderId),
      memo: memo || "주문 취소 환불",
      expires_at: expiresAtFor(when),
      expired: 0,
      created_at: when,
    });
    log("points_refunded", { userId: Number(userId), orderId: orderId, points: points });
    return { id: id, balance: after };
  });
}

/** 적립했던 포인트를 회수한다(취소된 주문의 적립분) */
export function revokeEarned(userId: any, orderId: any, at?: string): any {
  const when = at || nowIso();
  const rows = dao.listLedgerForOrder(orderId).filter((r: any) => r.kind === "earn" && Number(r.user_id) === Number(userId) && !r.expired);
  if (rows.length === 0) return null;
  let total = 0;
  for (const r of rows) total += toInt(r.amount);
  if (total <= 0) return null;
  return tx(() => {
    const balance = getBalance(userId);
    const take = total > balance ? balance : total;
    if (take <= 0) return null;
    const after = changeBalance(userId, -take, when);
    for (const r of rows) dao.markExpired(r.id);
    dao.insertLedger({
      user_id: Number(userId),
      kind: "admin",
      amount: -take,
      balance_after: after,
      order_id: Number(orderId),
      memo: "취소 주문 적립 회수",
      expires_at: null,
      expired: 0,
      created_at: when,
    });
    return { balance: after, revoked: take };
  });
}

/** 관리자 조정 */
export function adjust(userId: any, amount: any, memo: string, at?: string): any {
  const points = toInt(amount);
  if (points === 0) throw badRequest("조정할 포인트를 입력해 주세요.");
  const user = loadUser(userId);
  if (!user) throw badRequest("없는 고객입니다.");
  const when = at || nowIso();
  return tx(() => {
    const balance = getBalance(userId);
    if (balance + points < 0) throw conflict("POINT_NOT_ENOUGH", "보유 포인트보다 많이 차감할 수 없어요.");
    const after = changeBalance(userId, points, when);
    dao.insertLedger({
      user_id: Number(userId),
      kind: "admin",
      amount: points,
      balance_after: after,
      order_id: null,
      memo: memo || "관리자 조정",
      expires_at: points > 0 ? expiresAtFor(when) : null,
      expired: 0,
      created_at: when,
    });
    return { balance: after };
  });
}

/**
 * 소멸 배치: 적립 후 1년이 지난 적립분을 지운다.
 * 이미 다 쓴 경우를 생각해 보유분보다 많이 지우지는 않는다.
 */
export function expireOld(atIso?: string): any {
  const when = atIso || nowIso();
  const rows = dao.findExpirable(when);
  let processed = 0;
  let expiredPoints = 0;
  const touchedUsers: any = {};
  tx(() => {
    for (const r of rows) {
      const balance = getBalance(r.user_id);
      const take = toInt(r.amount) > balance ? balance : toInt(r.amount);
      dao.markExpired(r.id);
      processed++;
      if (take <= 0) continue;
      const after = changeBalance(r.user_id, -take, when);
      dao.insertLedger({
        user_id: r.user_id,
        kind: "expire",
        amount: -take,
        balance_after: after,
        order_id: null,
        memo: "유효기간 만료",
        expires_at: null,
        expired: 0,
        created_at: when,
      });
      expiredPoints += take;
      touchedUsers[r.user_id] = true;
    }
  });
  log("points_expired", { rows: rows.length, processed: processed, points: expiredPoints });
  return { total: rows.length, processed: processed, points: expiredPoints, users: Object.keys(touchedUsers).length };
}

/** 고객 화면용 내역 */
export function history(userId: any): any {
  const rows = dao.listLedger(userId, 200);
  return {
    balance: getBalance(userId),
    history: rows.map((r: any) => ({
      id: r.id,
      kind: r.kind,
      kindText: kindText(r.kind),
      description: ledgerDescription(r),
      orderId: r.order_id,
      orderNumber: r.order_number || null,
      amount: signedAmount(r.kind, r.amount),
      balanceAfter: toInt(r.balance_after),
      createdAt: r.created_at,
      createdAtText: fmtMdHm(r.created_at),
      expiresAt: r.expires_at,
    })),
  };
}

export function onPointsChanged(userId: any, reason: string): void {
  emit("points.changed", { userId: Number(userId), reason: reason, balance: getBalance(userId) });
}

/** 관리자: 포인트를 많이 가진 고객 */
export function topHolders(limit: number): any[] {
  return dao.topHolders(limit);
}

/** 관리자: 남아 있는 포인트 총액 */
export function totalOutstanding(): number {
  return dao.totalOutstanding();
}

/** 관리자: 고객 한 명의 종류별 합계 */
export function sumByKind(userId: any): any {
  return dao.sumByKind(userId);
}
