// 반품·교환 규칙: 배송완료 7일 안에 신청하고, 관리자가 승인·거절한다.
import { CONFIG, DAY, RETURN_REASONS, fmtMd, toDate, toInt } from "../../legacy/legacyUtils.ts";

export const RETURN_KINDS = ["return", "exchange"];

export function reasonCodes(): string[] {
  return RETURN_REASONS.map((r: any) => r.code);
}

/** 반품 마감 시각 */
export function deadlineOf(deliveredAt: any): Date {
  return new Date(toDate(deliveredAt).getTime() + CONFIG.RETURN_DAYS * DAY);
}

/**
 * 이 주문을 지금 반품·교환할 수 있는지. deliveredAt은 배송완료 시각(없으면 null).
 * { ok: true, deadline } 또는 { ok: false, reason }
 */
export function eligibility(order: any, atValue: any, deliveredAt: string | null): any {
  if (!order) return { ok: false, reason: "주문을 찾을 수 없어요." };
  if (order.status === "cancelled") return { ok: false, reason: "취소된 주문이에요." };
  if (order.status !== "delivered") return { ok: false, reason: "배송이 끝난 뒤에 신청할 수 있어요." };
  if (!deliveredAt) return { ok: false, reason: "배송이 끝난 뒤에 신청할 수 있어요." };
  const deadline = deadlineOf(deliveredAt);
  if (toDate(atValue).getTime() > deadline.getTime()) {
    return { ok: false, reason: "배송완료 " + CONFIG.RETURN_DAYS + "일이 지나 신청할 수 없어요. (" + fmtMd(deadline) + "까지)" };
  }
  return { ok: true, deadline: deadline.toISOString(), deliveredAt: deliveredAt };
}

/** 품목마다 더 신청할 수 있는 수량. taken은 품목별로 이미 신청한 수량 */
export function remainingQuantities(items: any[], taken: any): any {
  const out: any = {};
  for (const item of items) out[item.id] = toInt(item.quantity) - toInt(taken[item.id] || 0);
  return out;
}

/** 신청 품목 검사. 문제가 있으면 메시지 */
export function checkRequestItems(lines: any[], items: any[], remaining: any): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return "반품·교환할 상품을 골라 주세요.";
  const byId: any = {};
  for (const item of items) byId[item.id] = item;
  for (const line of lines) {
    const item = byId[line.orderItemId];
    if (!item) return "이 주문의 상품이 아니에요.";
    const qty = toInt(line.quantity);
    if (qty <= 0) return "수량은 1개 이상이어야 해요.";
    if (qty > toInt(remaining[item.id])) return item.product_name + "은(는) 이미 신청한 수량이 있어 " + remaining[item.id] + "개까지 신청할 수 있어요.";
  }
  return null;
}

/** 환불 금액: 반품은 고른 상품 금액, 교환은 0원 */
export function refundAmountFor(kind: string, lines: any[], items: any[]): number {
  if (kind !== "return") return 0;
  const byId: any = {};
  for (const item of items) byId[item.id] = item;
  let total = 0;
  for (const line of lines) {
    const item = byId[line.orderItemId];
    if (item) total += toInt(item.unit_price) * toInt(line.quantity);
  }
  return total;
}
