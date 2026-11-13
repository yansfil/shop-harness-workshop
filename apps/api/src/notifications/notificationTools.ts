// 알림 대기열 관리 도구: 보내지 않기, 실패 모두 다시 보내기, 문구 미리 보기, 종류별 현황
import { NOTIFY_TYPES, addDays, badRequest, conflict, log, notFoundError, notifyTypeLabel, now, nowIso, percentText, safeJson } from "../legacy/legacyUtils.ts";
import * as dao from "./infra/notificationDao.ts";
import { render, iconOf } from "./domain/notificationTemplates.ts";
import { retry } from "./notificationQueue.ts";

/** 대기 중이거나 실패한 알림을 보내지 않기로 한다 */
export function cancel(queueId: any): any {
  const q = dao.findQueue(queueId);
  if (!q) throw notFoundError("알림을 찾을 수 없습니다.");
  if (q.state === "cancelled") return { id: q.id, state: "cancelled", changed: false };
  if (q.state === "sent") throw conflict("NOTIFICATION_SENT", "이미 보낸 알림은 취소할 수 없어요.");
  dao.cancelQueue(q.id, nowIso());
  log("notification_cancelled", { queueId: q.id });
  return { id: q.id, state: "cancelled", changed: true };
}

/** 실패한 알림을 한 번에 다시 보낸다(최대 100건) */
export function retryAllFailed(): any {
  const ids = dao.failedIds(100);
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    const r = retry(id);
    if (r.state === "sent") sent++;
    else failed++;
  }
  return { total: ids.length, sent: sent, failed: failed };
}

const SAMPLE_PAYLOAD: any = {
  orderId: 5001,
  orderNumber: "GM-20261113-0001",
  itemText: "유기농 바나나 외 1건",
  refundAmount: 25800,
  trackingNo: "SB-5521-0087-6355",
  name: "11월 장바구니 쿠폰",
  discountAmount: 2000,
  points: 1200,
  dateText: "2026.11.30",
  reason: "사진으로 손상을 확인하지 못했어요",
  title: "주말 배송 안내",
  body: "이번 주말에는 배송이 하루 늦어질 수 있어요.",
  link: "/orders",
};

/** 종류마다 예시 값으로 만든 알림 문구 */
export function templatePreview(): any {
  return {
    templates: Object.keys(NOTIFY_TYPES).map((type) => {
      const n = render(type, SAMPLE_PAYLOAD);
      return { type: type, label: notifyTypeLabel(type), icon: iconOf(type), title: n.title, body: n.body, link: n.link };
    }),
  };
}

/** 지난 7일 종류별 보낸·실패·대기 건수 */
export function typeStats(daysInput: any): any {
  const days = Number(daysInput) > 0 && Number(daysInput) <= 90 ? Number(daysInput) : 7;
  const rows = dao.countByTypeSince(addDays(now(), -days).toISOString());
  const byType: any = {};
  for (const r of rows) {
    if (!byType[r.type]) byType[r.type] = { sent: 0, failed: 0, pending: 0, cancelled: 0 };
    byType[r.type][r.state] = Number(r.n);
  }
  return {
    days: days,
    types: Object.keys(NOTIFY_TYPES).map((type) => {
      const c = byType[type] || { sent: 0, failed: 0, pending: 0, cancelled: 0 };
      const total = c.sent + c.failed + c.pending + c.cancelled;
      return { type: type, label: notifyTypeLabel(type), total: total, sent: c.sent, failed: c.failed, pending: c.pending, cancelled: c.cancelled, failRateText: total > 0 ? percentText(c.failed / total) : "-" };
    }),
  };
}

/** 대기열 한 건의 내용(관리자 상세) */
export function detail(queueId: any): any {
  const q = dao.findQueue(queueId);
  if (!q) throw notFoundError("알림을 찾을 수 없습니다.");
  const payload = safeJson(q.payload);
  if (!payload) throw badRequest("알림 내용을 읽을 수 없어요.");
  const n = render(q.type, payload);
  return { id: q.id, type: q.type, label: notifyTypeLabel(q.type), state: q.state, attempts: q.attempts, lastError: q.last_error, preview: n };
}
