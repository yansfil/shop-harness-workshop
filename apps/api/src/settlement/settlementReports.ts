// 정산 항목별 리포트(카테고리·상품·쿠폰·포인트·시간대), 정산 조정, 정산 지급 예정
import {
  addBusinessDays,
  addDays,
  badRequest,
  changeText,
  comma,
  conflict,
  dayList,
  fmtMd,
  fmtMdHm,
  fmtMdWeek,
  isBlank,
  isValidDate,
  log,
  notFoundError,
  now,
  nowIso,
  percentText,
  startOfDay,
  str,
  toCsv,
  toDate,
  toInt,
  trim,
  ymd,
  CONFIG,
  DAY,
  POINT_KIND_TEXT,
} from "../legacy/legacyUtils.ts";
import * as reportQueries from "./infra/reportQueries.ts";
import { closedDays } from "./infra/settlementQueries.ts";

const MAX_DAYS = 120;
const PAYOUT_BUSINESS_DAYS = 2;

function rangeOf(fromInput: any, toInput: any): any {
  const to = isBlank(toInput) ? ymd(addDays(startOfDay(now()), -1)) : String(toInput);
  const from = isBlank(fromInput) ? ymd(addDays(toDate(to), -(CONFIG.DEFAULT_DAILY_RANGE - 1))) : String(fromInput);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !isValidDate(from)) throw badRequest("시작일이 올바르지 않습니다.", { fieldErrors: { from: ["YYYY-MM-DD 형식이어야 합니다"] } });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || !isValidDate(to)) throw badRequest("종료일이 올바르지 않습니다.", { fieldErrors: { to: ["YYYY-MM-DD 형식이어야 합니다"] } });
  if (from > to) throw badRequest("시작일이 종료일보다 늦습니다.", { fieldErrors: { from: ["종료일보다 앞이어야 합니다"] } });
  const days = Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY) + 1;
  if (days > MAX_DAYS) throw badRequest("한 번에 " + MAX_DAYS + "일까지 볼 수 있어요.", { fieldErrors: { from: ["기간이 너무 깁니다"] } });
  const fromIso = startOfDay(from).toISOString();
  const toIso = addDays(startOfDay(to), 1).toISOString();
  // 바로 앞 같은 길이 기간 (증감 비교용)
  const prevFromIso = addDays(startOfDay(from), -days).toISOString();
  return { from: from, to: to, days: days, fromIso: fromIso, toIso: toIso, prevFromIso: prevFromIso, prevToIso: fromIso };
}

function num(v: any): number {
  return v == null ? 0 : Number(v);
}

/** 항목별 정산: 한 화면에 카테고리·상품·쿠폰·포인트·시간대를 모두 */
export function breakdown(fromInput: any, toInput: any): any {
  const r = rangeOf(fromInput, toInput);
  const summary = reportQueries.orderSummary(r.fromIso, r.toIso);
  const prev = reportQueries.orderSummary(r.prevFromIso, r.prevToIso);
  const refunds = reportQueries.refundSummary(r.fromIso, r.toIso);
  const goodsTotal = num(summary.goods);

  const categories = reportQueries.categorySums(r.fromIso, r.toIso).map((c: any) => ({
    categoryId: c.category_id,
    name: c.category_name,
    orderCount: num(c.order_count),
    quantity: num(c.quantity),
    goodsAmount: num(c.goods),
    shareText: goodsTotal > 0 ? percentText(num(c.goods) / goodsTotal) : "-",
    share: goodsTotal > 0 ? num(c.goods) / goodsTotal : 0,
  }));

  const products = reportQueries.productSums(r.fromIso, r.toIso, 10).map((p: any, index: number) => ({
    rank: index + 1,
    productId: p.product_id,
    name: p.product_name,
    categoryName: p.category_name,
    orderCount: num(p.order_count),
    quantity: num(p.quantity),
    goodsAmount: num(p.goods),
  }));

  const coupons = reportQueries.couponSums(r.fromIso, r.toIso).map((c: any) => ({
    couponId: c.coupon_id,
    code: c.code,
    name: c.name,
    uses: num(c.uses),
    discount: num(c.discount),
    orderTotal: num(c.order_total),
    // 할인 1원이 만든 주문 금액
    leverageText: num(c.discount) > 0 ? (num(c.order_total) / num(c.discount)).toFixed(1) + "배" : "-",
  }));
  let couponDiscountTotal = 0;
  for (const c of coupons) couponDiscountTotal += c.discount;

  const flows: any = { earn: 0, use: 0, expire: 0, refund: 0, admin: 0 };
  for (const f of reportQueries.pointFlows(r.fromIso, r.toIso)) flows[f.kind] = num(f.amount);
  const points = {
    earned: flows.earn,
    used: -flows.use,
    expired: -flows.expire,
    refunded: flows.refund,
    adjusted: flows.admin,
    outstanding: reportQueries.pointOutstanding(),
    rows: Object.keys(POINT_KIND_TEXT).map((k) => ({ kind: k, label: POINT_KIND_TEXT[k], amount: flows[k] || 0 })),
  };

  const hourMap: any = {};
  for (const h of reportQueries.hourlyCounts(r.fromIso, r.toIso)) hourMap[h.hour] = h;
  let peakHour = -1;
  let peakCount = 0;
  const hours: any[] = [];
  for (let h = 0; h < 24; h++) {
    const row = hourMap[h];
    const count = row ? num(row.order_count) : 0;
    if (count > peakCount) {
      peakCount = count;
      peakHour = h;
    }
    hours.push({ hour: h, label: (h < 10 ? "0" : "") + h + "시", orderCount: count, total: row ? num(row.total) : 0 });
  }

  return {
    from: r.from,
    to: r.to,
    periodText: fmtMd(r.from) + " ~ " + fmtMd(r.to),
    summary: {
      orderCount: num(summary.order_count),
      customerCount: num(summary.customer_count),
      totalAmount: num(summary.total),
      paidAmount: num(summary.paid),
      averageOrder: num(summary.order_count) > 0 ? Math.round(num(summary.total) / num(summary.order_count)) : 0,
      orderCountChange: changeText(summary.order_count, prev.order_count),
      totalChange: changeText(summary.total, prev.total),
      couponDiscount: couponDiscountTotal,
      cancelCount: refunds.cancelCount,
      cancelAmount: refunds.cancelAmount,
      returnCount: refunds.returnCount,
      returnAmount: refunds.returnAmount,
    },
    categories: categories,
    products: products,
    coupons: coupons,
    points: points,
    hours: hours,
    peakHourText: peakHour < 0 ? null : (peakHour < 10 ? "0" : "") + peakHour + "시 (" + comma(peakCount) + "건)",
  };
}

/** 항목별 CSV: kind = category | product | coupon */
export function breakdownCsv(kind: any, fromInput: any, toInput: any): any {
  const report = breakdown(fromInput, toInput);
  const suffix = report.from + "_" + report.to + ".csv";
  if (kind === "category") {
    return {
      filename: "settlement-category-" + suffix,
      csv: toCsv(report.categories, [
        { key: "name", title: "카테고리" },
        { key: "orderCount", title: "주문 건수" },
        { key: "quantity", title: "판매 수량" },
        { key: "goodsAmount", title: "상품 매출" },
        { key: "shareText", title: "비중" },
      ]),
    };
  }
  if (kind === "product") {
    return {
      filename: "settlement-product-" + suffix,
      csv: toCsv(report.products, [
        { key: "rank", title: "순위" },
        { key: "name", title: "상품" },
        { key: "categoryName", title: "카테고리" },
        { key: "quantity", title: "판매 수량" },
        { key: "goodsAmount", title: "상품 매출" },
      ]),
    };
  }
  if (kind === "coupon") {
    return {
      filename: "settlement-coupon-" + suffix,
      csv: toCsv(report.coupons, [
        { key: "code", title: "쿠폰 코드" },
        { key: "name", title: "쿠폰 이름" },
        { key: "uses", title: "사용 건수" },
        { key: "discount", title: "할인 금액" },
        { key: "orderTotal", title: "주문 금액" },
      ]),
    };
  }
  throw badRequest("CSV 종류가 올바르지 않습니다.");
}

/* 정산 조정 ------------------------------------------------------------ */

function adjustmentDto(a: any): any {
  return {
    id: a.id,
    day: a.day,
    dayText: fmtMdWeek(a.day),
    amount: a.amount,
    reason: a.reason,
    createdBy: a.created_by_name || null,
    createdAt: a.created_at,
    createdAtText: fmtMdHm(a.created_at),
    cancelled: !!a.cancelled_at,
    cancelledAtText: a.cancelled_at ? fmtMdHm(a.cancelled_at) : null,
  };
}

export function adjustments(fromInput: any, toInput: any): any {
  const r = rangeOf(fromInput, toInput);
  const rows = reportQueries.listAdjustments(r.from, r.to);
  let total = 0;
  for (const a of rows) if (!a.cancelled_at) total += Number(a.amount);
  return { from: r.from, to: r.to, rows: rows.map(adjustmentDto), totalAmount: total };
}

/** 정산 조정 더하기: 마감된 날에만, 0원이 아닌 금액과 이유 */
export function addAdjustment(admin: any, body: any): any {
  const day = trim(body.day);
  const amount = toInt(body.amount);
  const reason = trim(body.reason);
  const fieldErrors: any = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isValidDate(day)) fieldErrors.day = ["날짜를 골라 주세요"];
  if (!amount) fieldErrors.amount = ["0이 아닌 금액을 넣어 주세요"];
  if (Math.abs(amount) > 10000000) fieldErrors.amount = ["한 번에 1천만 원까지 조정할 수 있어요"];
  if (reason.length < 2) fieldErrors.reason = ["이유를 적어 주세요"];
  if (Object.keys(fieldErrors).length > 0) throw badRequest("입력을 확인해 주세요.", { fieldErrors: fieldErrors });
  if (closedDays(day, day).length === 0) throw conflict("DAY_NOT_CLOSED", "마감된 날에만 조정할 수 있어요. " + fmtMd(day) + "은 아직 마감 전이에요.");
  const at = nowIso();
  const id = reportQueries.insertAdjustment({ day: day, amount: amount, reason: reason.slice(0, 200), created_by: admin.id, created_at: at, cancelled_at: null });
  log("settlement_adjusted", { id: id, day: day, amount: amount });
  return adjustmentDto({ ...reportQueries.findAdjustment(id), created_by_name: admin.name });
}

export function cancelAdjustmentById(idInput: any): any {
  const id = Number(idInput);
  const row = reportQueries.findAdjustment(id);
  if (!row) throw notFoundError("조정 기록을 찾을 수 없습니다.");
  if (row.cancelled_at) throw conflict("ADJUSTMENT_CANCELLED", "이미 취소한 조정이에요.");
  reportQueries.cancelAdjustment(id, nowIso());
  log("settlement_adjust_cancelled", { id: id });
  return adjustmentDto(reportQueries.findAdjustment(id));
}

/* 정산 지급 예정 --------------------------------------------------------- */

/**
 * 마감된 날의 정산금은 2영업일 뒤에 판매 대금 계좌로 들어온다.
 * 조정 금액은 같은 날 지급분에 더한다.
 */
export function payouts(fromInput: any, toInput: any): any {
  const r = rangeOf(fromInput, toInput);
  const closed: any = {};
  for (const c of closedDays(r.from, r.to)) closed[c.day] = c;
  const adj = reportQueries.adjustmentSumByDay(r.from, r.to);
  const today = ymd(now());
  const rows = dayList(r.from, r.to)
    .reverse()
    .map((day) => {
      const c = closed[day];
      const payDay = ymd(addBusinessDays(day, PAYOUT_BUSINESS_DAYS));
      const adjustment = adj[day] ? adj[day].amount : 0;
      const base = c ? Math.round(Number(c.net_amount)) : null;
      return {
        day: day,
        dayText: fmtMdWeek(day),
        closed: !!c,
        closedAtText: c ? fmtMdHm(c.closed_at) : null,
        orderCount: c ? c.order_count : null,
        netAmount: base,
        adjustment: adjustment,
        adjustmentCount: adj[day] ? adj[day].count : 0,
        payoutAmount: base == null ? null : base + adjustment,
        payoutDay: payDay,
        payoutDayText: fmtMdWeek(payDay),
        payoutState: !c ? "not_closed" : payDay <= today ? "paid" : "scheduled",
        payoutStateText: !c ? "마감 전" : payDay <= today ? "지급됨" : "지급 예정",
      };
    });
  let scheduled = 0;
  let paid = 0;
  for (const row of rows) {
    if (row.payoutAmount == null) continue;
    if (row.payoutState === "paid") paid += row.payoutAmount;
    else scheduled += row.payoutAmount;
  }
  return { from: r.from, to: r.to, rows: rows, scheduledAmount: scheduled, paidAmount: paid, payoutRuleText: "마감일 다음 " + PAYOUT_BUSINESS_DAYS + "영업일에 지급" };
}

export function payoutsCsv(fromInput: any, toInput: any): any {
  const report = payouts(fromInput, toInput);
  return {
    filename: "settlement-payout-" + report.from + "_" + report.to + ".csv",
    csv: toCsv(report.rows, [
      { key: "day", title: "정산일" },
      { key: "orderCount", title: "주문 건수" },
      { key: "netAmount", title: "정산 금액" },
      { key: "adjustment", title: "조정" },
      { key: "payoutAmount", title: "지급 금액" },
      { key: "payoutDay", title: "지급일" },
      { key: "payoutStateText", title: "상태" },
    ]),
  };
}

export function describeAdjustment(a: any): string {
  return fmtMd(a.day) + " " + (a.amount > 0 ? "+" : "") + comma(a.amount) + "원 " + str(a.reason);
}
