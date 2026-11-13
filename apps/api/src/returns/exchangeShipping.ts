// 교환 재발송과 반품 사유 통계
import {
  RETURN_KIND_TEXT,
  RETURN_REASONS,
  addDays,
  badRequest,
  conflict,
  courierName,
  customerLabel,
  emit,
  fmtMdHm,
  isBlank,
  isValidDate,
  itemSummary,
  log,
  notFoundError,
  now,
  nowIso,
  percentText,
  returnReasonText,
  shortOrderNo,
  startOfDay,
  toDate,
  trim,
  tx,
  upper,
  ymd,
  HOUR,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/returnDao.ts";
import * as shipDao from "./infra/returnShipmentDao.ts";

// 교환 상품은 택배사와 상관없이 하루 뒤 도착한 것으로 본다
const RESHIP_HOURS = 24;

export function reshipOf(returnId: any): any {
  const s = shipDao.findByReturn(returnId);
  if (!s) return null;
  return {
    courierCode: s.courier_code,
    courierName: courierName(s.courier_code),
    trackingNo: s.tracking_no,
    registeredAt: s.registered_at,
    registeredAtText: fmtMdHm(s.registered_at),
    delivered: !!s.delivered_at,
    deliveredAtText: s.delivered_at ? fmtMdHm(s.delivered_at) : null,
    stateText: s.delivered_at ? "교환 상품 도착" : "교환 상품 배송중",
  };
}

/** 다시 보낼 교환 목록 */
export function pendingReships(): any {
  const rows = shipDao.approvedWithoutReship(200);
  return {
    requests: rows.map((r: any) => {
      const items = dao.itemsOf(r.id);
      return {
        id: r.id,
        requestNo: r.request_no,
        orderId: r.order_id,
        shortOrderNumber: shortOrderNo(r.order_number),
        customer: customerLabel({ email: r.user_email, name: r.user_name }),
        itemSummary: itemSummary(items),
        decidedAtText: fmtMdHm(r.decided_at),
      };
    }),
  };
}

/** 교환 상품 발송 등록: 승인된 교환만, 한 번만 */
export function registerReship(admin: any, returnId: any, courierCodeInput: any, trackingNoInput: any): any {
  const r = dao.findRequest(returnId);
  if (!r) throw notFoundError("교환 신청을 찾을 수 없습니다.");
  if (r.kind !== "exchange") throw conflict("NOT_EXCHANGE", RETURN_KIND_TEXT[r.kind] + " 신청은 다시 보낼 상품이 없어요.");
  if (r.state !== "approved") throw conflict("EXCHANGE_NOT_APPROVED", "승인된 교환만 다시 보낼 수 있어요.");
  const courierCode = trim(courierCodeInput);
  const trackingNo = upper(trackingNoInput);
  if (isBlank(courierCode) || courierName(courierCode) === courierCode) throw badRequest("택배사를 골라 주세요.", { fieldErrors: { courierCode: ["택배사를 골라 주세요"] } });
  if (!/^[A-Z]{2}-\d{4}-\d{4}-\d{4}$/.test(trackingNo) || trackingNo.slice(0, 2) !== courierCode) {
    throw badRequest("송장 번호는 " + courierCode + "-0000-0000-0000 형식이에요.", { fieldErrors: { trackingNo: ["형식을 확인해 주세요"] } });
  }
  const existing = shipDao.findByReturn(r.id);
  if (existing) {
    if (existing.tracking_no === trackingNo) return { returnId: r.id, created: false, reship: reshipOf(r.id) };
    throw conflict("RESHIP_EXISTS", "이미 교환 상품을 보냈어요.");
  }
  if (shipDao.findByTrackingNo(trackingNo)) throw conflict("TRACKING_NO_USED", "이미 쓴 송장 번호예요.");
  const at = nowIso();
  tx(() => {
    shipDao.insertReship({ return_id: r.id, courier_code: courierCode, tracking_no: trackingNo, registered_by: admin.id, registered_at: at, delivered_at: null });
  });
  const items = dao.itemsOf(r.id);
  emit("exchange.shipped", { orderId: r.order_id, requestNo: r.request_no, trackingNo: trackingNo, itemText: itemSummary(items), at: at });
  log("exchange_reshipped", { returnId: r.id, trackingNo: trackingNo });
  return { returnId: r.id, created: true, reship: reshipOf(r.id) };
}

/** 배송 동기화 배치가 같이 부른다: 하루 지난 교환 상품은 도착 처리 */
export function syncReships(atIso?: string): number {
  const when = atIso || nowIso();
  const limit = toDate(when).getTime() - RESHIP_HOURS * HOUR;
  let n = 0;
  for (const s of shipDao.undelivered()) {
    if (toDate(s.registered_at).getTime() <= limit) {
      shipDao.markDelivered(s.id, new Date(toDate(s.registered_at).getTime() + RESHIP_HOURS * HOUR).toISOString());
      n++;
    }
  }
  return n;
}

/** 반품·교환 사유 통계 (기본 지난 30일) */
export function reasonStats(fromInput: any, toInput: any): any {
  const to = isBlank(toInput) ? ymd(now()) : String(toInput);
  const from = isBlank(fromInput) ? ymd(addDays(toDate(to), -29)) : String(fromInput);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw badRequest("기간을 확인해 주세요.");
  const fromIso = startOfDay(from).toISOString();
  const toIso = addDays(startOfDay(to), 1).toISOString();
  const rows = shipDao.reasonCounts(fromIso, toIso);
  const byReason: any = {};
  let total = 0;
  let approved = 0;
  let refund = 0;
  for (const r of rows) {
    if (!byReason[r.reason_code]) byReason[r.reason_code] = { returns: 0, exchanges: 0, approved: 0, rejected: 0, requested: 0 };
    const b = byReason[r.reason_code];
    const n = Number(r.n);
    total += n;
    if (r.kind === "exchange") b.exchanges += n;
    else b.returns += n;
    b[r.state] += n;
    if (r.state === "approved") {
      approved += n;
      if (r.kind === "return") refund += Number(r.amount || 0);
    }
  }
  const avgHours = shipDao.averageDecisionHours(fromIso, toIso);
  return {
    from: from,
    to: to,
    total: total,
    approvedRateText: total > 0 ? percentText(approved / total) : "-",
    refundAmount: refund,
    averageDecisionText: avgHours == null ? "-" : avgHours < 1 ? "1시간 안" : Math.round(avgHours) + "시간",
    reasons: RETURN_REASONS.map((x: any) => {
      const b = byReason[x.code] || { returns: 0, exchanges: 0, approved: 0, rejected: 0, requested: 0 };
      const count = b.returns + b.exchanges;
      return { code: x.code, text: returnReasonText(x.code), count: count, returns: b.returns, exchanges: b.exchanges, approved: b.approved, rejected: b.rejected, waiting: b.requested, shareText: total > 0 ? percentText(count / total) : "-" };
    }),
    products: shipDao.productCounts(fromIso, toIso, 10).map((p: any) => ({ productId: p.product_id, name: p.product_name, requests: Number(p.requests), quantity: Number(p.quantity) })),
  };
}
