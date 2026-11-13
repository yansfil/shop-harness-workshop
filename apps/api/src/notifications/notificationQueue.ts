// 알림 대기열: 일이 생기면 대기열에 넣고, 작업자가 몇 초마다 꺼내 알림함으로 보낸다.
import {
  CONFIG,
  NOTIFY_GROUPS,
  STATE,
  addMinutes,
  badRequest,
  customerLabel,
  fmtMdHm,
  itemSummary,
  loadOrderItems,
  loadOrderRow,
  log,
  logError,
  notFoundError,
  notifyTypeLabel,
  nowIso,
  on,
  safeJson,
  tx,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/notificationDao.ts";
import { findSettings } from "./infra/settingsDao.ts";
import { iconOf, queueSummary, render } from "./domain/notificationTemplates.ts";

/** 고객이 수신 설정에서 끈 종류인지 (주문 알림은 끌 수 없다) */
function turnedOff(userId: any, type: string): boolean {
  const group = NOTIFY_GROUPS[type];
  if (!group || group === "order") return false;
  const s = findSettings(userId);
  return !!s && !s[group];
}

export function enqueue(userId: any, type: string, payload: any, at?: string): number {
  if (turnedOff(userId, type)) return 0;
  const when = at || nowIso();
  return dao.insertQueue({
    user_id: Number(userId),
    type: type,
    payload: JSON.stringify(payload || {}),
    scheduled_at: when,
    attempts: 0,
    state: "pending",
    last_error: null,
    notification_id: null,
    sent_at: null,
    created_at: when,
  });
}

/** 주문 관련 알림을 넣는다(상품 요약과 주문 번호를 같이 싣는다) */
export function enqueueForOrder(type: string, orderId: any, extra?: any, at?: string): number | null {
  const order = loadOrderRow(orderId);
  if (!order) return null;
  const items = loadOrderItems(orderId);
  return enqueue(order.customer_id, type, { orderId: order.id, orderNumber: order.order_number, itemText: itemSummary(items), ...(extra || {}) }, at);
}

/** 보내기 흉내: 알림 서버가 가끔 응답하지 않는다 */
function deliver(q: any, payload: any): void {
  if (Number(q.id) % 13 === 0 && !payload.manualRetry) throw new Error("알림 서버가 응답하지 않았어요");
}

/** 보낼 때가 된 알림을 보낸다 */
export function processDue(limit?: number, atIso?: string): any {
  const when = atIso || nowIso();
  const rows = dao.dueQueue(when, limit || CONFIG.NOTIFY_BATCH_SIZE);
  let sent = 0;
  let failed = 0;
  for (const q of rows) {
    const payload = safeJson(q.payload);
    try {
      deliver(q, payload);
      tx(() => {
        const n = render(q.type, payload);
        const notificationId = dao.insertNotification({
          user_id: q.user_id,
          type: q.type,
          title: n.title,
          body: n.body,
          link: n.link,
          read_at: null,
          created_at: when,
        });
        dao.markSent(q.id, notificationId, when);
      });
      sent++;
      STATE.sentCount++;
    } catch (e: any) {
      const attempts = Number(q.attempts) + 1;
      const finalFail = attempts >= CONFIG.NOTIFY_MAX_ATTEMPTS;
      dao.markAttemptFailed(q.id, e && e.message ? e.message : String(e), addMinutes(when, attempts * 5).toISOString(), finalFail);
      failed++;
      STATE.failedCount++;
      if (finalFail) logError("notification_failed", e, { queueId: q.id, type: q.type });
    }
  }
  if (rows.length > 0) log("notification_queue_processed", { picked: rows.length, sent: sent, failed: failed });
  return { picked: rows.length, sent: sent, failed: failed };
}

/** 실패한 알림을 다시 보낸다(관리자) */
export function retry(queueId: any): any {
  const q = dao.findQueue(queueId);
  if (!q) throw notFoundError("알림을 찾을 수 없습니다.");
  if (q.state !== "failed") throw badRequest("실패한 알림만 다시 보낼 수 있어요.");
  const payload = safeJson(q.payload);
  payload.manualRetry = true;
  tx(() => {
    dao.resetForRetry(q.id, nowIso());
    dao.updatePayload(q.id, JSON.stringify(payload));
  });
  const result = processDue(CONFIG.NOTIFY_BATCH_SIZE);
  const after = dao.findQueue(queueId);
  return { id: q.id, state: after ? after.state : q.state, processed: result };
}

/** 관리자 대기열 화면 */
export function adminList(tab: string): any {
  const states = tab === "sent" ? ["sent"] : ["pending", "failed"];
  const rows = dao.listQueue(states, tab === "sent" ? 300 : 500);
  const counts = dao.countQueue();
  return {
    tab: tab === "sent" ? "sent" : "waiting",
    counts: { waiting: counts.pending + counts.failed, pending: counts.pending, failed: counts.failed, sent: counts.sent },
    items: rows.map((q: any) => {
      const payload = safeJson(q.payload);
      return {
        id: q.id,
        scheduledAt: q.scheduled_at,
        scheduledAtText: fmtMdHm(q.scheduled_at),
        type: q.type,
        typeText: notifyTypeLabel(q.type),
        target: customerLabel({ email: q.user_email, name: q.user_name }),
        summary: queueSummary(q.type, payload),
        attempts: q.attempts,
        state: q.state,
        lastError: q.last_error,
        sentAt: q.sent_at,
      };
    }),
    worker: { running: STATE.workerRunning, sentCount: STATE.sentCount, failedCount: STATE.failedCount },
  };
}

/** 고객 알림함 */
export function inbox(userId: any, unreadOnly: boolean): any {
  const rows = dao.listNotifications(userId, unreadOnly, 100);
  return {
    unreadCount: dao.unreadCount(userId),
    notifications: rows.map((n: any) => ({
      id: n.id,
      type: n.type,
      icon: iconOf(n.type),
      title: n.title,
      body: n.body,
      link: n.link,
      read: n.read_at != null,
      createdAt: n.created_at,
      createdAtText: fmtMdHm(n.created_at),
    })),
  };
}

export function unreadCount(userId: any): number {
  return dao.unreadCount(userId);
}

export function markRead(userId: any, id: any): any {
  dao.markRead(userId, id, nowIso());
  return { unreadCount: dao.unreadCount(userId) };
}

export function markAllRead(userId: any): any {
  const changed = dao.markAllRead(userId, nowIso());
  return { changed: changed, unreadCount: 0 };
}

let _listening = false;

/** 다른 영역에서 생긴 일을 듣고 알림을 넣는다 */
export function listen(): void {
  if (_listening) return;
  _listening = true;
  on("order.placed", (e: any) => enqueueForOrder("order_placed", e.orderId, null, e.at));
  on("order.cancelled", (e: any) => enqueueForOrder("order_cancelled", e.orderId, { refundAmount: e.refundAmount }, e.at));
  on("shipment.registered", (e: any) => enqueueForOrder("shipping_started", e.orderId, { trackingNo: e.trackingNo }, e.at));
  on("shipment.delivered", (e: any) => enqueueForOrder("delivered", e.orderId, null, e.at));
  on("coupon.arrived", (e: any) => enqueue(e.userId, "coupon_arrived", { couponId: e.couponId, name: e.name, discountAmount: e.discountAmount }, e.at));
  on("return.requested", (e: any) => enqueueForOrder(e.kind === "exchange" ? "exchange_received" : "return_received", e.orderId, { itemText: e.itemText, requestNo: e.requestNo }, e.at));
  on("return.decided", (e: any) => {
    const type = e.state === "rejected" ? "return_rejected" : e.kind === "exchange" ? "exchange_approved" : "return_approved";
    enqueueForOrder(type, e.orderId, { itemText: e.itemText, requestNo: e.requestNo, refundAmount: e.refundAmount, reason: e.reason }, e.at);
  });
  on("points.expiring", (e: any) => enqueue(e.userId, "points_expiring", { points: e.points, dateText: e.dateText }, e.at));
  on("coupon.expiring", (e: any) => enqueue(e.userId, "coupon_expiring", { couponId: e.couponId, name: e.name, discountAmount: e.discountAmount, dateText: e.dateText }, e.at));
  on("address.changed", (e: any) => enqueueForOrder("address_changed", e.orderId, null, e.at));
  on("points.granted", (e: any) => enqueue(e.userId, "points_granted", { points: e.points, title: e.title }, e.at));
  on("exchange.shipped", (e: any) => enqueueForOrder("exchange_shipped", e.orderId, { itemText: e.itemText, requestNo: e.requestNo, trackingNo: e.trackingNo }, e.at));
}
