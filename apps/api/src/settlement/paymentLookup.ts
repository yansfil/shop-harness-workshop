// 결제 내역 조회(관리자): 기간·상태·쿠폰·포인트·환불·금액·고객으로 걸러 보고 CSV로 받는다
import {
  addDays,
  badRequest,
  customerLabel,
  fmtMdHm,
  isBlank,
  isValidDate,
  now,
  startOfDay,
  toCsv,
  toDate,
  toInt,
  trim,
  ymd,
  DAY,
  ORDER_STATUS_TEXT,
} from "../legacy/legacyUtils.ts";
import * as paymentQueries from "./infra/paymentQueries.ts";

const PAGE_SIZE = 50;
const REFUND_TEXT: any = { none: "없음", partial: "부분 환불", full: "전액 환불" };
const YES_NO = ["yes", "no"];

function filtersOf(q: any): any {
  const to = isBlank(q.to) ? ymd(now()) : String(q.to);
  const from = isBlank(q.from) ? ymd(addDays(toDate(to), -6)) : String(q.from);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw badRequest("기간을 확인해 주세요.", { fieldErrors: { from: ["기간을 확인해 주세요"] } });
  if ((toDate(to).getTime() - toDate(from).getTime()) / DAY > 92) throw badRequest("한 번에 3달까지 볼 수 있어요.", { fieldErrors: { from: ["기간이 너무 깁니다"] } });
  const status = Object.keys(ORDER_STATUS_TEXT).indexOf(q.status) >= 0 ? q.status : null;
  const refund = Object.keys(REFUND_TEXT).indexOf(q.refund) >= 0 ? q.refund : null;
  const minAmount = isBlank(q.min) ? null : toInt(q.min);
  const maxAmount = isBlank(q.max) ? null : toInt(q.max);
  if (minAmount != null && maxAmount != null && minAmount > maxAmount) throw badRequest("최소 금액이 최대 금액보다 커요.", { fieldErrors: { min: ["최대 금액보다 작아야 합니다"] } });
  return {
    from: from,
    to: to,
    fromIso: startOfDay(from).toISOString(),
    toIso: addDays(startOfDay(to), 1).toISOString(),
    status: status,
    coupon: YES_NO.indexOf(q.coupon) >= 0 ? q.coupon : null,
    points: YES_NO.indexOf(q.points) >= 0 ? q.points : null,
    refund: refund,
    minAmount: minAmount,
    maxAmount: maxAmount,
    email: isBlank(q.email) ? null : trim(q.email).slice(0, 60),
  };
}

function rowDto(r: any): any {
  return {
    orderId: r.id,
    orderNumber: r.order_number,
    orderedAtText: fmtMdHm(r.created_at),
    customer: customerLabel(r),
    status: r.status,
    statusText: ORDER_STATUS_TEXT[r.status],
    total: r.total,
    couponCode: r.coupon_code || null,
    couponDiscount: r.coupon_discount,
    pointUsed: r.point_used,
    paidAmount: r.paid_amount,
    rewardPoints: r.reward_points,
    refundedAmount: r.refunded_amount,
    refundStatus: r.refund_status,
    refundText: REFUND_TEXT[r.refund_status] || r.refund_status,
  };
}

export function search(q: any): any {
  const f = filtersOf(q || {});
  const page = Math.max(1, toInt(q.page) || 1);
  const sums = paymentQueries.countPayments(f);
  const count = Number(sums.n || 0);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const rows = paymentQueries.listPayments(f, PAGE_SIZE, (Math.min(page, pages) - 1) * PAGE_SIZE);
  return {
    filters: { from: f.from, to: f.to, status: f.status, coupon: f.coupon, points: f.points, refund: f.refund, min: f.minAmount, max: f.maxAmount, email: f.email },
    page: Math.min(page, pages),
    pages: pages,
    count: count,
    sums: {
      total: Number(sums.total || 0),
      couponDiscount: Number(sums.coupon || 0),
      pointUsed: Number(sums.points || 0),
      paidAmount: Number(sums.paid || 0),
      refundedAmount: Number(sums.refunded || 0),
      rewardPoints: Number(sums.reward || 0),
    },
    rows: rows.map(rowDto),
    refundOptions: Object.keys(REFUND_TEXT).map((k) => ({ value: k, label: REFUND_TEXT[k] })),
  };
}

/** CSV: 페이지 없이 조건에 맞는 전체 (최대 1만 건) */
export function searchCsv(q: any): any {
  const f = filtersOf(q || {});
  const rows = paymentQueries.listPayments(f, 10000, 0).map(rowDto);
  return {
    filename: "payments-" + f.from + "_" + f.to + ".csv",
    csv: toCsv(rows, [
      { key: "orderNumber", title: "주문 번호" },
      { key: "orderedAtText", title: "주문 일시" },
      { key: "customer", title: "고객" },
      { key: "statusText", title: "상태" },
      { key: "total", title: "주문 금액" },
      { key: "couponCode", title: "쿠폰" },
      { key: "couponDiscount", title: "쿠폰 할인" },
      { key: "pointUsed", title: "포인트 사용" },
      { key: "paidAmount", title: "결제 금액" },
      { key: "rewardPoints", title: "적립 포인트" },
      { key: "refundedAmount", title: "환불 금액" },
      { key: "refundText", title: "환불" },
    ]),
  };
}
