// 배치 작업 내용
import { addDays, comma, emit, fmtDot, fmtMd, now, nowIso, startOfDay, ym, ymd } from "../../legacy/legacyUtils.ts";
import { closeDay, unclosedDays } from "../../settlement/settlementService.ts";
import { countOrdersOnDay, findClosedDay } from "../../settlement/infra/settlementQueries.ts";
import { expireOld } from "../../points/pointManager.ts";
import { syncDelivered } from "../../delivery/deliveryManager.ts";
import { delays } from "../../delivery/deliveryOps.ts";
import { syncReships } from "../../returns/exchangeShipping.ts";
import { expiringNoticeTargets } from "../../points/pointCampaigns.ts";
import { cleanup } from "../../notifications/notificationSettings.ts";
import { expiringWalletTargets } from "../../coupons/couponOps.ts";

/**
 * 일 마감 정산: 어제 정산을 마감한다. 지난 7일 안에 빠진 날이 있으면 같이 마감한다.
 * processed: 마감한 주문 수, total: 대상 주문 수
 */
export function settlementCloseJob(runId: number, runKey: string): any {
  const days = unclosedDays(7);
  if (days.indexOf(runKey) < 0 && !findClosedDay(runKey)) days.push(runKey);
  let processed = 0;
  let total = 0;
  const closed: string[] = [];
  const logs: string[] = [];
  for (const day of days.sort()) {
    const expected = countOrdersOnDay(day);
    total += expected;
    const r = closeDay(day, runId);
    processed += r.orderCount;
    closed.push(fmtMd(day));
    logs.push(fmtMd(day) + " 마감: 주문 " + comma(r.orderCount) + "건, 정산 " + comma(Math.round(r.netAmount)) + "원");
  }
  const note = closed.length > 1 ? closed.join(", ") + " 마감" : null;
  return { processed: processed, total: total, note: note, logs: logs };
}

/** 포인트 소멸: 적립 1년이 지난 포인트를 지운다 */
export function pointExpireJob(_runId: number, _runKey: string): any {
  const r = expireOld(nowIso());
  return {
    processed: r.processed,
    total: r.total,
    note: r.points > 0 ? r.points + "P 소멸" : null,
    logs: ["적립분 " + comma(r.total) + "건 확인", "고객 " + comma(r.users) + "명, " + comma(r.points) + "P 소멸"],
  };
}

/** 배송 상태 동기화 */
export function deliverySyncJob(_runId: number, _runKey: string): any {
  const r = syncDelivered(nowIso());
  const reships = syncReships(nowIso());
  const logs = ["송장 " + comma(r.total) + "건 조회", "배송완료 " + comma(r.delivered) + "건, 배송중으로 " + comma(r.inTransit) + "건"];
  if (r.failed > 0) logs.push("처리 실패 " + r.failed + "건");
  if (reships > 0) logs.push("교환 상품 도착 " + reships + "건");
  return {
    processed: r.delivered,
    total: r.total,
    note: r.inTransit > 0 ? "배송중 " + r.inTransit + "건" : null,
    quiet: r.delivered === 0 && r.inTransit === 0 && r.failed === 0 && reships === 0,
    logs: logs,
  };
}

/** 포인트 소멸 예정 알림: 30일 안에 사라질 포인트가 있는 고객에게 한 달에 한 번 */
export function pointsExpiringNoticeJob(_runId: number, _runKey: string): any {
  const targets = expiringNoticeTargets(30);
  const at = nowIso();
  let sent = 0;
  for (const t of targets) {
    if (t.points <= 0) continue;
    emit("points.expiring", { userId: t.userId, points: t.points, dateText: fmtDot(t.firstAt), at: at });
    sent++;
  }
  return { processed: sent, total: targets.length, note: sent > 0 ? "고객 " + sent + "명에게 안내" : null, logs: ["대상 고객 " + targets.length + "명, 안내 " + sent + "명"] };
}

/** 배송 지연 점검: 출고 지연·배송 지연 건수를 남긴다 */
export function shipmentDelayCheckJob(_runId: number, _runKey: string): any {
  const d = delays();
  const logs: string[] = [];
  for (const w of d.waiting.slice(0, 20)) logs.push("출고 지연 " + w.orderNumber + " (" + w.lateBusinessDays + "영업일)");
  for (const l of d.late.slice(0, 20)) logs.push("배송 지연 " + l.orderNumber + " " + l.trackingNo);
  const total = d.waiting.length + d.late.length;
  return {
    processed: total,
    total: total,
    note: total > 0 ? "출고 지연 " + d.waiting.length + "건 · 배송 지연 " + d.late.length + "건" : "지연 없음",
    logs: logs,
  };
}

/** 쿠폰 만료 예정 알림: 3일 안에 끝나는 안 쓴 쿠폰 */
export function couponExpiringNoticeJob(_runId: number, _runKey: string): any {
  const targets = expiringWalletTargets(3);
  const at = nowIso();
  const coupons: any = {};
  for (const t of targets) {
    emit("coupon.expiring", { userId: t.userId, couponId: t.couponId, name: t.name, discountAmount: t.discountAmount, dateText: fmtDot(t.endsAt), at: at });
    coupons[t.name] = (coupons[t.name] || 0) + 1;
  }
  return {
    processed: targets.length,
    total: targets.length,
    note: targets.length > 0 ? "고객 " + targets.length + "명에게 안내" : null,
    logs: Object.keys(coupons).map((k) => k + ": " + coupons[k] + "명"),
  };
}

/** 지난 알림 정리 */
export function notificationCleanupJob(_runId: number, _runKey: string): any {
  const r = cleanup();
  return { processed: r.queue + r.read, total: r.total + r.read, note: null, logs: ["보낸 대기열 기록 " + r.queue + "건, 읽은 알림 " + r.read + "건 삭제"] };
}

/** 작업별 실행 키(같은 키로는 한 번만 성공한다) */
export function runKeyFor(job: string): string {
  if (job === "settlement_close") return ymd(addDays(startOfDay(now()), -1));
  if (job === "point_expire") return ymd(now());
  if (job === "points_expiring_notice") return ym(now());
  if (job === "shipment_delay_check" || job === "notification_cleanup" || job === "coupon_expiring_notice") return ymd(now());
  const d = now();
  return d.toISOString().slice(0, 15) + "0";
}

export const JOB_FUNCTIONS: any = {
  settlement_close: settlementCloseJob,
  point_expire: pointExpireJob,
  delivery_sync: deliverySyncJob,
  points_expiring_notice: pointsExpiringNoticeJob,
  shipment_delay_check: shipmentDelayCheckJob,
  notification_cleanup: notificationCleanupJob,
  coupon_expiring_notice: couponExpiringNoticeJob,
};

/** 앞 배치에 기대는 작업: 포인트 소멸은 그날 정산 마감이 실패하면 건너뛴다 */
export const JOB_DEPENDS_ON: any = {
  point_expire: "settlement_close",
};
