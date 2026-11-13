// 반품·교환 신청과 승인
import {
  RETURN_KIND_TEXT,
  RETURN_STATE_TEXT,
  badRequest,
  conflict,
  customerLabel,
  emit,
  fmtMd,
  fmtMdHm,
  isBlank,
  itemSummary,
  loadOrderItems,
  loadOrderRow,
  log,
  makeReturnNo,
  mustOneOf,
  notFoundError,
  now,
  nowIso,
  returnReasonText,
  RETURN_REASONS,
  shortOrderNo,
  toInt,
  trim,
  truncate,
  tx,
  addDays,
  CONFIG,
  ORDER_STATUS_TEXT,
  groupBy,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/returnDao.ts";
import { RETURN_KINDS, checkRequestItems, eligibility, reasonCodes, refundAmountFor, remainingQuantities } from "./domain/returnPolicy.ts";
import { restoreReturnedStock } from "./application/stockRestore.ts";
import { reshipOf } from "./exchangeShipping.ts";

function nextRequestNo(): string {
  const last = dao.lastRequestNo();
  const n = last ? Number(String(last).replace(/\D/g, "")) + 1 : 1;
  return makeReturnNo(n);
}

function itemDto(ri: any): any {
  return {
    orderItemId: ri.order_item_id,
    productId: ri.product_id,
    productName: ri.product_name,
    imageUrl: ri.image_path,
    quantity: ri.quantity,
    amount: ri.amount,
  };
}

function requestDto(r: any, items: any[]): any {
  return {
    id: r.id,
    requestNo: r.request_no,
    orderId: r.order_id,
    orderNumber: r.order_number,
    shortOrderNumber: shortOrderNo(r.order_number),
    kind: r.kind,
    kindText: RETURN_KIND_TEXT[r.kind],
    reasonCode: r.reason_code,
    reasonText: returnReasonText(r.reason_code),
    detail: r.detail,
    state: r.state,
    stateText: RETURN_STATE_TEXT[r.state],
    refundAmount: r.refund_amount,
    rejectReason: r.reject_reason,
    createdAt: r.created_at,
    createdAtText: fmtMdHm(r.created_at),
    decidedAt: r.decided_at,
    decidedAtText: fmtMdHm(r.decided_at),
    items: items.map(itemDto),
    itemSummary: itemSummary(items),
    reship: r.kind === "exchange" && r.state === "approved" ? reshipOf(r.id) : null,
  };
}

/** 신청할 수 있는 주문(배송완료 7일 안) */
export function eligibleOrders(user: any): any {
  const since = addDays(now(), -CONFIG.RETURN_DAYS).toISOString();
  const orders = dao.deliveredOrdersOf(user.id, since);
  const at = nowIso();
  return {
    reasons: RETURN_REASONS,
    returnDays: CONFIG.RETURN_DAYS,
    orders: orders.map((o: any) => {
      const items = loadOrderItems(o.id);
      const remaining = remainingQuantities(items, dao.requestedQuantities(o.id));
      const check = eligibility(o, at, dao.deliveredAtOf(o.id));
      return {
        id: o.id,
        orderNumber: o.order_number,
        shortOrderNumber: shortOrderNo(o.order_number),
        orderedAtText: fmtMdHm(o.created_at),
        deliveredAt: o.delivered_at,
        deliveredAtText: fmtMd(o.delivered_at),
        status: o.status,
        statusText: ORDER_STATUS_TEXT[o.status],
        eligible: check.ok,
        reason: check.ok ? null : check.reason,
        deadlineText: check.ok ? fmtMd(check.deadline) + "까지" : null,
        items: items.map((i: any) => ({
          orderItemId: i.id,
          productId: i.product_id,
          productName: i.product_name,
          imageUrl: i.image_path,
          unitPrice: i.unit_price,
          quantity: i.quantity,
          remaining: remaining[i.id],
        })),
      };
    }),
  };
}

/** 주문 한 건의 반품 가능 여부 (주문 상세 버튼용) */
export function eligibilityFor(order: any): any {
  const check = eligibility(order, nowIso(), dao.deliveredAtOf(order.id));
  return { returnable: check.ok, returnBlockedReason: check.ok ? null : check.reason, returnDeadline: check.ok ? check.deadline : null };
}

/** 고객 신청 */
export function request(user: any, body: any): any {
  const orderId = toInt(body.orderId);
  const order = loadOrderRow(orderId);
  if (!order || Number(order.customer_id) !== Number(user.id)) throw notFoundError("주문을 찾을 수 없습니다.");
  const kind = mustOneOf(body.kind, RETURN_KINDS, "kind");
  const reasonCode = mustOneOf(body.reasonCode, reasonCodes(), "reasonCode");
  const detail = isBlank(body.detail) ? null : truncate(trim(body.detail), 500);
  const at = nowIso();
  const check = eligibility(order, at, dao.deliveredAtOf(order.id));
  if (!check.ok) throw conflict("RETURN_NOT_ALLOWED", check.reason);
  const items = loadOrderItems(orderId);
  const lines = Array.isArray(body.items) ? body.items : [];
  const problem = checkRequestItems(lines, items, remainingQuantities(items, dao.requestedQuantities(orderId)));
  if (problem) throw badRequest(problem, { fieldErrors: { items: [problem] } });
  const refundAmount = refundAmountFor(kind, lines, items);
  const byId: any = {};
  for (const i of items) byId[i.id] = i;
  const result = tx(() => {
    const requestNo = nextRequestNo();
    const id = dao.insertRequest({
      request_no: requestNo,
      order_id: orderId,
      user_id: user.id,
      kind: kind,
      reason_code: reasonCode,
      detail: detail,
      state: "requested",
      refund_amount: refundAmount,
      reject_reason: null,
      decided_by: null,
      decided_at: null,
      created_at: at,
    });
    for (const line of lines) {
      const item = byId[line.orderItemId];
      dao.insertItem({
        return_id: id,
        order_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: toInt(line.quantity),
        amount: toInt(item.unit_price) * toInt(line.quantity),
      });
    }
    return { id: id, requestNo: requestNo };
  });
  const saved = dao.findRequest(result.id);
  const savedItems = dao.itemsOf(result.id);
  emit("return.requested", { orderId: orderId, kind: kind, requestNo: result.requestNo, itemText: itemSummary(savedItems), at: at });
  log("return_requested", { returnId: result.id, orderId: orderId, kind: kind });
  return { request: requestDto(saved, savedItems) };
}

/** 내 신청 목록 */
export function mine(user: any): any {
  const rows = dao.listByUser(user.id);
  const items = groupBy(dao.itemsOfMany(rows.map((r: any) => Number(r.id))), "return_id");
  return { requests: rows.map((r: any) => requestDto(r, items[r.id] || [])) };
}

/** 관리자 목록 */
export function adminList(stateInput: any): any {
  const state = ["requested", "approved", "rejected", "withdrawn"].indexOf(stateInput) >= 0 ? stateInput : "requested";
  const rows = dao.listByState(state, 300);
  const items = groupBy(dao.itemsOfMany(rows.map((r: any) => Number(r.id))), "return_id");
  return {
    state: state,
    counts: dao.countByState(),
    requests: rows.map((r: any) => ({
      ...requestDto(r, items[r.id] || []),
      customer: customerLabel({ email: r.user_email, name: r.user_name }),
    })),
  };
}

/** 승인: 반품이면 그 상품 금액을 환불하고 재고를 되돌린다 */
export function approve(admin: any, id: any): any {
  const r = dao.findRequest(id);
  if (!r) throw notFoundError("반품 신청을 찾을 수 없습니다.");
  if (r.state === "approved") return { request: requestDto(r, dao.itemsOf(r.id)), changed: false };
  if (r.state !== "requested") throw conflict("RETURN_ALREADY_DECIDED", "이미 처리한 신청이에요.");
  const items = dao.itemsOf(r.id);
  const at = nowIso();
  tx(() => {
    dao.decide(r.id, "approved", admin.id, at, null);
    if (r.kind === "return") {
      restoreReturnedStock(r.order_id, items, "반품 " + r.request_no, at);
      dao.addRefund(r.order_id, Number(r.refund_amount), at);
    }
  });
  emit("return.decided", { orderId: r.order_id, kind: r.kind, state: "approved", requestNo: r.request_no, refundAmount: r.refund_amount, itemText: itemSummary(items), at: at });
  log("return_approved", { returnId: r.id, refund: r.refund_amount });
  return { request: requestDto(dao.findRequest(r.id), items), changed: true };
}

/** 고객 신청 취소: 승인 대기 중인 내 신청만 */
export function withdraw(user: any, id: any): any {
  const r = dao.findRequest(id);
  if (!r || Number(r.user_id) !== Number(user.id)) throw notFoundError("반품 신청을 찾을 수 없습니다.");
  if (r.state === "withdrawn") return { request: requestDto(r, dao.itemsOf(r.id)), changed: false };
  if (r.state !== "requested") throw conflict("RETURN_ALREADY_DECIDED", "이미 " + RETURN_STATE_TEXT[r.state] + " 신청은 취소할 수 없어요.");
  dao.withdraw(r.id, nowIso());
  log("return_withdrawn", { returnId: r.id });
  return { request: requestDto(dao.findRequest(r.id), dao.itemsOf(r.id)), changed: true };
}

/** 거절 */
export function reject(admin: any, id: any, reasonInput: any): any {
  const r = dao.findRequest(id);
  if (!r) throw notFoundError("반품 신청을 찾을 수 없습니다.");
  if (r.state === "rejected") return { request: requestDto(r, dao.itemsOf(r.id)), changed: false };
  if (r.state !== "requested") throw conflict("RETURN_ALREADY_DECIDED", "이미 처리한 신청이에요.");
  const reason = isBlank(reasonInput) ? "반품 조건에 맞지 않아요" : truncate(trim(reasonInput), 200);
  const at = nowIso();
  dao.decide(r.id, "rejected", admin.id, at, reason);
  const items = dao.itemsOf(r.id);
  emit("return.decided", { orderId: r.order_id, kind: r.kind, state: "rejected", requestNo: r.request_no, refundAmount: 0, reason: reason, itemText: itemSummary(items), at: at });
  return { request: requestDto(dao.findRequest(r.id), items), changed: true };
}

export function forOrder(orderId: any): any[] {
  return dao
    .listByUser(loadOrderRow(orderId) ? loadOrderRow(orderId).customer_id : 0)
    .filter((r: any) => Number(r.order_id) === Number(orderId))
    .map((r: any) => ({ id: r.id, requestNo: r.request_no, kind: r.kind, kindText: RETURN_KIND_TEXT[r.kind], state: r.state, stateText: RETURN_STATE_TEXT[r.state], refundAmount: r.refund_amount }));
}

/** 관리자 화면 상단 숫자: 상태별 신청 수 */
export function countByState(): any {
  return dao.countByState();
}
