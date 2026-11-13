// 정산 리포트: 일별·월별, CSV, 일 마감
import {
  addDays,
  badRequest,
  dayList,
  fmtMd,
  fmtMonthKo,
  groupBy,
  isBlank,
  isValidDate,
  log,
  monthList,
  now,
  nowIso,
  startOfDay,
  startOfMonth,
  startOfNextMonth,
  toCsv,
  toDate,
  trim,
  ym,
  ymd,
  CONFIG,
  DAY,
} from "../legacy/legacyUtils.ts";
import * as queries from "./infra/settlementQueries.ts";
import { emptyRow, monthRow, settleOrder, toDto, totalOf, type SettlementRow } from "./domain/settlementCalc.ts";

const MAX_DAYS = 120;

/** 기본 기간: 어제까지 10일 */
export function defaultRange(): any {
  const to = addDays(startOfDay(now()), -1);
  const from = addDays(to, -(CONFIG.DEFAULT_DAILY_RANGE - 1));
  return { from: ymd(from), to: ymd(to) };
}

function parseRange(fromInput: any, toInput: any): any {
  const d = defaultRange();
  const from = isBlank(fromInput) ? d.from : String(fromInput);
  const to = isBlank(toInput) ? d.to : String(toInput);
  if (!isValidDate(from) || !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw badRequest("시작일이 올바르지 않습니다.", { fieldErrors: { from: ["YYYY-MM-DD 형식이어야 합니다"] } });
  if (!isValidDate(to) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw badRequest("종료일이 올바르지 않습니다.", { fieldErrors: { to: ["YYYY-MM-DD 형식이어야 합니다"] } });
  if (from > to) throw badRequest("시작일이 종료일보다 늦습니다.", { fieldErrors: { from: ["종료일보다 앞이어야 합니다"] } });
  const days = (toDate(to).getTime() - toDate(from).getTime()) / DAY + 1;
  if (days > MAX_DAYS) throw badRequest("한 번에 " + MAX_DAYS + "일까지 볼 수 있어요.", { fieldErrors: { from: ["기간이 너무 깁니다"] } });
  return { from: from, to: to };
}

/** 일별 정산 */
export function daily(fromInput: any, toInput: any, keyword: any): any {
  const range = parseRange(fromInput, toInput);
  const fromIso = startOfDay(range.from).toISOString();
  const toIso = addDays(startOfDay(range.to), 1).toISOString();
  const orders = queries.loadOrders(fromIso, toIso, trim(keyword));
  const items = queries.loadItems(orders.map((o: any) => o.id));
  const itemsByOrder = groupBy(items, "order_id");
  const byDay: any = {};
  for (const order of orders) {
    const day = String(order.created_at).slice(0, 10);
    if (!byDay[day]) byDay[day] = emptyRow(day);
    const r = settleOrder(order, itemsByOrder[order.id] || []);
    const target = byDay[day];
    target.orderCount += r.orderCount;
    target.goods += r.goods;
    target.shipping += r.shipping;
    target.coupon += r.coupon;
    target.point += r.point;
    target.net += r.net;
  }
  const closed: any = {};
  for (const c of queries.closedDays(range.from, range.to)) closed[c.day] = c;
  const rows: SettlementRow[] = dayList(range.from, range.to)
    .reverse()
    .map((day) => byDay[day] || emptyRow(day));
  const total = totalOf(rows);
  return {
    period: "day",
    from: range.from,
    to: range.to,
    periodText: fmtMd(range.from) + " ~ " + fmtMd(range.to),
    keyword: trim(keyword),
    rows: rows.map((r) => ({ ...toDto(r), label: fmtMd(r.key), day: r.key, closed: !!closed[r.key] })),
    total: toDto(total),
  };
}

/** 월별 정산: 첫 주문 달부터 이번 달까지 */
export function monthly(keyword: any): any {
  const first = queries.firstOrderAt();
  const last = queries.lastOrderAt();
  if (!first || !last) return { period: "month", rows: [], total: toDto(emptyRow("total")), periodText: "", keyword: trim(keyword) };
  const fromIso = startOfMonth(first).toISOString();
  const toIso = startOfNextMonth(now() > toDate(last) ? now() : last).toISOString();
  const sums = queries.monthlyItemSums(fromIso, toIso, trim(keyword));
  const shipping = queries.monthlyShipping(fromIso, toIso, trim(keyword));
  const shippingByMonth: any = {};
  for (const s of shipping) shippingByMonth[s.month] = Number(s.shipping || 0);
  const sumsByMonth: any = {};
  for (const s of sums) sumsByMonth[s.month] = s;
  const months = monthList(first, toDate(toIso).getTime() - 1).reverse();
  const rows: SettlementRow[] = months.map((m) => (sumsByMonth[m] ? monthRow(m, sumsByMonth[m], shippingByMonth[m] || 0) : emptyRow(m)));
  const total = totalOf(rows);
  const lastDay = ymd(last);
  return {
    period: "month",
    from: ym(first),
    to: ym(toDate(toIso).getTime() - 1),
    periodText: fmtMonthKo(ym(first)) + " ~ " + fmtMonthKo(ym(last)) + " (" + fmtMd(lastDay) + "까지)",
    keyword: trim(keyword),
    rows: rows.map((r) => ({ ...toDto(r), label: fmtMonthKo(r.key), month: r.key })),
    total: toDto(total),
  };
}

const CSV_COLUMNS = (firstTitle: string) => [
  { key: "label", title: firstTitle },
  { key: "orderCount", title: "주문 건수" },
  { key: "goodsAmount", title: "상품 매출" },
  { key: "shippingAmount", title: "배송비" },
  { key: "couponDiscount", title: "쿠폰 할인" },
  { key: "pointUsed", title: "포인트 사용" },
  { key: "netAmount", title: "정산 금액" },
];

export function dailyCsv(fromInput: any, toInput: any, keyword: any): any {
  const report = daily(fromInput, toInput, keyword);
  const rows = report.rows.map((r: any) => ({ ...r, label: r.day }));
  rows.push({ ...report.total, label: "합계" });
  return { filename: "settlement-daily-" + report.from + "_" + report.to + ".csv", csv: toCsv(rows, CSV_COLUMNS("일자")) };
}

export function monthlyCsv(keyword: any): any {
  const report = monthly(keyword);
  const rows = report.rows.map((r: any) => ({ ...r, label: r.month }));
  rows.push({ ...report.total, label: "합계" });
  return { filename: "settlement-monthly-" + ymd(nowIso()) + ".csv", csv: toCsv(rows, CSV_COLUMNS("월")) };
}

/** 일 마감: 그날 정산을 계산해 settlement_daily에 남긴다 */
export function closeDay(day: string, runId?: any): any {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw badRequest("마감할 날짜가 올바르지 않습니다.");
  const report = daily(day, day, "");
  const row = report.rows[0];
  queries.saveClosedDay({
    day: day,
    order_count: row.orderCount,
    goods_amount: row.goodsAmount,
    shipping_amount: row.shippingAmount,
    coupon_amount: row.couponDiscount,
    point_amount: row.pointUsed,
    net_amount: row.netAmount,
    closed_at: nowIso(),
    closed_by_run: runId == null ? null : runId,
  });
  log("settlement_day_closed", { day: day, orders: row.orderCount, net: row.netAmount });
  return { day: day, orderCount: row.orderCount, netAmount: row.netAmount };
}

/** 마감 안 된 날을 찾는다(어제까지) */
export function unclosedDays(limitDays: number): string[] {
  const to = addDays(startOfDay(now()), -1);
  const from = addDays(to, -(limitDays - 1));
  const closed: any = {};
  for (const c of queries.closedDays(ymd(from), ymd(to))) closed[c.day] = true;
  return dayList(from, to).filter((d) => !closed[d]);
}

export function summaryForDashboard(): any {
  const r = daily(null, null, "");
  return { periodText: r.periodText, netAmount: r.total.netAmount, orderCount: r.total.orderCount };
}

export function rangeForMonth(month: string): any {
  const start = startOfMonth(month + "-01");
  const end = addDays(startOfNextMonth(start), -1);
  return { from: ymd(start), to: ymd(end) };
}
