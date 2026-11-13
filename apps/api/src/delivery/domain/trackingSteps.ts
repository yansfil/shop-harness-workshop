// 배송 단계와 걸리는 시간(가짜 택배사 기준)
import { MINUTE, fmtMdHm, toDate } from "../../legacy/legacyUtils.ts";

export const TRACKING_STEPS: any[] = [
  { key: "received", title: "상품 접수", location: "그랩마켓 물류센터", offsetMin: 0 },
  { key: "picked_up", title: "집하", location: "경기 이천 물류센터", offsetMin: 20 },
  { key: "linehaul", title: "간선 상차", location: "수도권 중앙 허브에서 출발했어요", offsetMin: 60 },
  { key: "terminal", title: "지역 터미널 도착", location: "서울 동부 터미널", offsetMin: 180 },
  { key: "out_for_delivery", title: "배송 출발", location: "서울 성동 배송점", offsetMin: 360 },
  { key: "delivered", title: "배송 완료", location: "받는 곳 앞", offsetMin: 480 },
];

export const TOTAL_MINUTES = 480;

/**
 * 단계별 시각을 만든다. 배송 완료 시각이 정해져 있으면 그 사이에 단계를 고르게 넣는다.
 * done: 지금 기준으로 지난 단계
 */
export function timeline(registeredAt: any, deliveredAt: any, nowValue: any): any[] {
  const start = toDate(registeredAt).getTime();
  const nowMs = toDate(nowValue).getTime();
  const span = deliveredAt ? Math.max(toDate(deliveredAt).getTime() - start, MINUTE) : TOTAL_MINUTES * MINUTE;
  return TRACKING_STEPS.map((step: any) => {
    const at = start + Math.round((span * step.offsetMin) / TOTAL_MINUTES);
    const done = at <= nowMs;
    return {
      key: step.key,
      title: step.title,
      location: step.location,
      at: new Date(at).toISOString(),
      atText: done ? fmtMdHm(at) : "",
      done: done,
    };
  });
}

/** 마지막으로 지난 단계 */
export function currentStep(events: any[]): any {
  let last: any = null;
  for (const e of events) if (e.done) last = e;
  return last;
}

export function isDeliveredBy(registeredAt: any, nowValue: any): boolean {
  return toDate(nowValue).getTime() >= toDate(registeredAt).getTime() + TOTAL_MINUTES * MINUTE;
}

export function expectedArrival(registeredAt: any): Date {
  return new Date(toDate(registeredAt).getTime() + TOTAL_MINUTES * MINUTE);
}
