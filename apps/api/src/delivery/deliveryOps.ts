// 배송 운영: 송장 한꺼번에 등록, 출고·배송 지연, 택배사별 현황, 송장 CSV
import {
  COURIERS,
  addBusinessDays,
  addDays,
  badRequest,
  businessDaysBetween,
  courierName,
  customerLabel,
  dropHeader,
  fmtDurationMs,
  fmtMdHm,
  isBlank,
  isValidDate,
  loadOrderByNumber,
  log,
  now,
  parseCsvText,
  startOfDay,
  str,
  toCsv,
  toDate,
  trim,
  upper,
  ymd,
  HOUR,
  MINUTE,
  ORDER_STATUS_TEXT,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/shipmentDao.ts";
import { register, SHIPMENT_STATES } from "./deliveryManager.ts";
import { checkTrackingNo } from "./infra/fakeCourierApi.ts";
import { TOTAL_MINUTES } from "./domain/trackingSteps.ts";

const MAX_BULK_ROWS = 300;
const SHIP_WITHIN_BUSINESS_DAYS = 2;

/** 택배사 칸: 코드(SB) 또는 이름(새벽택배) 모두 받는다 */
function courierCodeOf(text: any): string {
  const t = trim(text).replace(/\(가상\)/g, "");
  const byCode = COURIERS.find((c: any) => c.code === upper(t));
  if (byCode) return byCode.code;
  const byName = COURIERS.find((c: any) => String(c.name).replace(/\(가상\)/g, "") === t);
  return byName ? byName.code : "";
}

/**
 * 붙여 넣은 송장 목록 검사. 한 줄: 주문번호, 택배사, 송장번호
 * 반환: 줄마다 ok/문제, 그리고 등록할 수 있는 줄 수
 */
export function checkBulk(text: any): any {
  const rows = dropHeader(parseCsvText(text));
  if (rows.length === 0) throw badRequest("붙여 넣은 줄이 없어요.", { fieldErrors: { text: ["주문번호, 택배사, 송장번호 순서로 한 줄씩 넣어 주세요"] } });
  if (rows.length > MAX_BULK_ROWS) throw badRequest("한 번에 " + MAX_BULK_ROWS + "줄까지 넣을 수 있어요.", { fieldErrors: { text: ["줄이 너무 많습니다"] } });
  const seenTracking: any = {};
  const seenOrder: any = {};
  const results = rows.map((r: any) => {
    const orderNumber = upper(r.cells[0]);
    const courierCode = courierCodeOf(r.cells[1]);
    const trackingNo = upper(r.cells[2]);
    const base = { line: r.line, orderNumber: orderNumber, courierCode: courierCode, courierName: courierCode ? courierName(courierCode) : str(r.cells[1]), trackingNo: trackingNo };
    if (r.cells.length < 3 || isBlank(orderNumber) || isBlank(trackingNo)) return { ...base, ok: false, problem: "칸이 모자라요. 주문번호, 택배사, 송장번호를 넣어 주세요." };
    const order = loadOrderByNumber(orderNumber);
    if (!order) return { ...base, ok: false, problem: "없는 주문 번호예요." };
    if (order.status !== "preparing") return { ...base, orderId: order.id, ok: false, problem: "배송준비 주문이 아니에요. 지금은 " + ORDER_STATUS_TEXT[order.status] + "이에요." };
    const formatProblem = checkTrackingNo(courierCode, trackingNo);
    if (formatProblem) return { ...base, orderId: order.id, ok: false, problem: formatProblem };
    if (seenOrder[orderNumber]) return { ...base, orderId: order.id, ok: false, problem: seenOrder[orderNumber] + "번째 줄과 같은 주문이에요." };
    if (seenTracking[trackingNo]) return { ...base, orderId: order.id, ok: false, problem: seenTracking[trackingNo] + "번째 줄과 같은 송장 번호예요." };
    if (dao.findByTrackingNo(trackingNo)) return { ...base, orderId: order.id, ok: false, problem: "이미 쓴 송장 번호예요." };
    if (dao.findByOrder(order.id)) return { ...base, orderId: order.id, ok: false, problem: "이미 송장이 있는 주문이에요." };
    seenOrder[orderNumber] = r.line;
    seenTracking[trackingNo] = r.line;
    return { ...base, orderId: order.id, ok: true, problem: null };
  });
  const okCount = results.filter((x: any) => x.ok).length;
  return { rows: results, okCount: okCount, problemCount: results.length - okCount };
}

/** 검사를 통과한 줄만 등록한다. 한 줄이 실패해도 나머지는 등록한다 */
export function registerBulk(admin: any, text: any): any {
  const checked = checkBulk(text);
  let registered = 0;
  const rows = checked.rows.map((r: any) => {
    if (!r.ok) return { ...r, registered: false };
    try {
      register(admin, r.orderId, r.courierCode, r.trackingNo);
      registered++;
      return { ...r, registered: true };
    } catch (e: any) {
      return { ...r, ok: false, registered: false, problem: e && e.message ? e.message : "등록하지 못했어요." };
    }
  });
  log("shipments_bulk_registered", { registered: registered, lines: rows.length });
  return { rows: rows, registered: registered, failed: rows.length - registered };
}

/**
 * 지연 목록
 * - 출고 지연: 결제 뒤 2영업일이 지나도록 송장이 없는 주문
 * - 배송 지연: 송장 등록 뒤 예상 시간의 두 배가 지나도록 도착하지 않은 송장
 */
export function delays(): any {
  const today = now();
  const shipBefore = startOfDay(addDays(today, -1)).toISOString();
  const waiting = dao
    .waitingOrders(shipBefore, 500)
    .map((o: any) => {
      const deadline = addBusinessDays(o.created_at, SHIP_WITHIN_BUSINESS_DAYS);
      const late = businessDaysBetween(deadline, today);
      return {
        orderId: o.id,
        orderNumber: o.order_number,
        customer: customerLabel({ email: o.customer_email, name: o.customer_name }),
        status: o.status,
        statusText: ORDER_STATUS_TEXT[o.status],
        orderedAtText: fmtMdHm(o.created_at),
        deadlineText: ymd(deadline),
        lateBusinessDays: late,
      };
    })
    .filter((o: any) => o.lateBusinessDays > 0);
  const transitBefore = new Date(today.getTime() - TOTAL_MINUTES * 2 * MINUTE).toISOString();
  const late = dao.lateShipments(transitBefore, 200).map((s: any) => ({
    orderId: s.order_id,
    orderNumber: s.order_number,
    customer: customerLabel({ email: s.customer_email, name: s.customer_name }),
    courierName: courierName(s.courier_code),
    trackingNo: s.tracking_no,
    registeredAtText: fmtMdHm(s.registered_at),
    elapsedText: fmtDurationMs(today.getTime() - toDate(s.registered_at).getTime()),
    state: s.state,
  }));
  return { waiting: waiting, late: late, shipWithinText: "결제 뒤 " + SHIP_WITHIN_BUSINESS_DAYS + "영업일 안에 출고" };
}

/** 택배사별 현황 (기본 지난 30일) */
export function courierStats(fromInput: any, toInput: any): any {
  const to = isBlank(toInput) ? ymd(now()) : String(toInput);
  const from = isBlank(fromInput) ? ymd(addDays(toDate(to), -29)) : String(fromInput);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw badRequest("기간을 확인해 주세요.");
  const rows = dao.courierSums(startOfDay(from).toISOString(), addDays(startOfDay(to), 1).toISOString());
  const byCode: any = {};
  for (const r of rows) byCode[r.courier_code] = r;
  return {
    from: from,
    to: to,
    couriers: COURIERS.map((c: any) => {
      const r = byCode[c.code];
      const avg = r && r.avg_minutes != null ? Number(r.avg_minutes) : null;
      return {
        code: c.code,
        name: c.name,
        count: r ? Number(r.n) : 0,
        delivered: r ? Number(r.delivered) : 0,
        averageText: avg == null ? "-" : avg >= 60 ? (avg / 60).toFixed(1) + "시간" : Math.round(avg) + "분",
        averageHours: avg == null ? null : Math.round((avg / 60) * 10) / 10,
      };
    }),
  };
}

/** 송장 CSV (택배사 접수 파일 형식) */
export function shipmentsCsv(fromInput: any, toInput: any): any {
  const to = isBlank(toInput) ? ymd(now()) : String(toInput);
  const from = isBlank(fromInput) ? ymd(addDays(toDate(to), -6)) : String(fromInput);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw badRequest("기간을 확인해 주세요.");
  const rows = dao.shipmentsBetween(startOfDay(from).toISOString(), addDays(startOfDay(to), 1).toISOString());
  return {
    filename: "shipments-" + from + "_" + to + ".csv",
    csv: toCsv(rows, [
      { key: "registered_at", title: "등록 일시", format: (v: any) => fmtMdHm(v) },
      { key: "order_number", title: "주문 번호" },
      { key: "courier_code", title: "택배사", format: (v: any) => courierName(v) },
      { key: "tracking_no", title: "송장 번호" },
      { key: "recipient_name", title: "받는 분" },
      { key: "shipping_address", title: "주소" },
      { key: "state", title: "상태", format: (v: any) => (v === SHIPMENT_STATES.DELIVERED ? "배송완료" : v === SHIPMENT_STATES.IN_TRANSIT ? "배송중" : "접수") },
      { key: "delivered_at", title: "도착 일시", format: (v: any) => (v ? fmtMdHm(v) : "") },
    ]),
  };
}

export function expectedHoursText(): string {
  return Math.round((TOTAL_MINUTES * MINUTE) / HOUR) + "시간";
}
