// 배치 작업 내용
import { addDays, now, nowIso, startOfDay, ymd, fmtMd } from "../../legacy/legacyUtils.ts";
import { closeDay, unclosedDays } from "../../settlement/settlementService.ts";
import { countOrdersOnDay, findClosedDay } from "../../settlement/infra/settlementQueries.ts";
import { expireOld } from "../../points/pointManager.ts";
import { syncDelivered } from "../../delivery/deliveryManager.ts";

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
  for (const day of days.sort()) {
    const expected = countOrdersOnDay(day);
    total += expected;
    const r = closeDay(day, runId);
    processed += r.orderCount;
    closed.push(fmtMd(day));
  }
  const note = closed.length > 1 ? closed.join(", ") + " 마감" : null;
  return { processed: processed, total: total, note: note };
}

/** 포인트 소멸: 적립 1년이 지난 포인트를 지운다 */
export function pointExpireJob(_runId: number, _runKey: string): any {
  const r = expireOld(nowIso());
  return { processed: r.processed, total: r.total, note: r.points > 0 ? r.points + "P 소멸" : null };
}

/** 배송 상태 동기화 */
export function deliverySyncJob(_runId: number, _runKey: string): any {
  const r = syncDelivered(nowIso());
  return { processed: r.delivered, total: r.total, note: r.inTransit > 0 ? "배송중 " + r.inTransit + "건" : null, quiet: r.delivered === 0 && r.inTransit === 0 && r.failed === 0 };
}

/** 작업별 실행 키(같은 키로는 한 번만 성공한다) */
export function runKeyFor(job: string): string {
  if (job === "settlement_close") return ymd(addDays(startOfDay(now()), -1));
  if (job === "point_expire") return ymd(now());
  const d = now();
  return d.toISOString().slice(0, 15) + "0";
}

export const JOB_FUNCTIONS: any = {
  settlement_close: settlementCloseJob,
  point_expire: pointExpireJob,
  delivery_sync: deliverySyncJob,
};

/** 앞 배치에 기대는 작업: 포인트 소멸은 그날 정산 마감이 실패하면 건너뛴다 */
export const JOB_DEPENDS_ON: any = {
  point_expire: "settlement_close",
};
