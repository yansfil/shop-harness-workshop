// 쿠폰 규칙: 관리자가 정액 할인·최소 주문 금액·유효기간으로 발급하고, 주문당 한 장, 만료·금액 미달은 이유와 함께 거절한다.
import { isBlank, isValidDate, toDate, toNumber, trim, upper } from "../../legacy/legacyUtils.ts";
import { COUPON_MESSAGES, couponLine, couponStateText, expiredMessage, minOrderMessage, notStartedMessage } from "../web/couponMessages.ts";

export const CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

/** 지금 쿠폰 상태 */
export function couponState(coupon: any, at: any): string {
  const t = toDate(at).getTime();
  if (coupon.paused_at) return "paused";
  if (Number(coupon.issued_count) >= Number(coupon.issue_limit) && Number(coupon.used_count) >= Number(coupon.issue_limit)) return "exhausted";
  if (Number(coupon.used_count) >= Number(coupon.issue_limit)) return "exhausted";
  if (t > toDate(coupon.ends_at).getTime()) return "expired";
  if (t < toDate(coupon.starts_at).getTime()) return "scheduled";
  return "active";
}

/**
 * 이 주문에 쓸 수 있는지. 쓸 수 있으면 { ok: true }, 아니면 { ok: false, code, message }
 * alreadyUsed: 이 고객이 이미 이 쿠폰을 쓴 적이 있는지
 */
export function checkApplicable(coupon: any, subtotal: any, alreadyUsed: boolean, at: any): any {
  if (!coupon) return { ok: false, code: "COUPON_NOT_FOUND", message: COUPON_MESSAGES.NOT_FOUND };
  const state = couponState(coupon, at);
  if (state === "scheduled") return { ok: false, code: "COUPON_NOT_STARTED", message: notStartedMessage(coupon.starts_at) };
  if (state === "expired") return { ok: false, code: "COUPON_EXPIRED", message: expiredMessage(coupon.ends_at) };
  if (state === "exhausted") return { ok: false, code: "COUPON_EXHAUSTED", message: COUPON_MESSAGES.EXHAUSTED };
  if (state === "paused") return { ok: false, code: "COUPON_PAUSED", message: COUPON_MESSAGES.PAUSED };
  if (alreadyUsed) return { ok: false, code: "COUPON_ALREADY_USED", message: COUPON_MESSAGES.ALREADY_USED };
  if (toNumber(subtotal) < toNumber(coupon.min_order_amount)) {
    return { ok: false, code: "COUPON_MIN_ORDER", message: minOrderMessage(coupon.min_order_amount, subtotal) };
  }
  return { ok: true };
}

/** 할인 금액 (정액) */
export function discountFor(coupon: any, _subtotal: any): number {
  if (!coupon) return 0;
  return toNumber(coupon.discount_amount);
}

/** 새 쿠폰 입력 검사. 문제가 있으면 { field: [이유] } */
export function validateNewCoupon(input: any): any {
  const errors: any = {};
  const code = upper(input.code);
  if (isBlank(input.name)) errors.name = ["쿠폰 이름을 입력해 주세요"];
  else if (trim(input.name).length > 40) errors.name = ["40자 안으로 입력해 주세요"];
  if (!CODE_PATTERN.test(code)) errors.code = ["영문 대문자와 숫자 4~20자로 입력해 주세요"];
  if (isBlank(input.discountAmount) || isNaN(Number(input.discountAmount))) errors.discountAmount = ["할인 금액을 입력해 주세요"];
  else if (!Number.isInteger(Number(input.discountAmount))) errors.discountAmount = ["원 단위로 입력해 주세요"];
  if (isBlank(input.minOrderAmount)) errors.minOrderAmount = ["최소 주문 금액을 입력해 주세요"];
  else if (!Number.isInteger(Number(input.minOrderAmount)) || Number(input.minOrderAmount) < 0) errors.minOrderAmount = ["0원 이상 원 단위로 입력해 주세요"];
  if (!isValidDate(input.endsAt)) errors.endsAt = ["유효기간을 입력해 주세요"];
  if (!isBlank(input.startsAt) && !isValidDate(input.startsAt)) errors.startsAt = ["시작일이 올바르지 않습니다"];
  if (!isBlank(input.startsAt) && isValidDate(input.startsAt) && isValidDate(input.endsAt) && toDate(input.startsAt) > toDate(input.endsAt)) {
    errors.endsAt = ["유효기간이 시작일보다 빠릅니다"];
  }
  if (isBlank(input.issueLimit) || !Number.isInteger(Number(input.issueLimit)) || Number(input.issueLimit) <= 0) errors.issueLimit = ["발급 수량은 1장 이상이어야 합니다"];
  return errors;
}

export function normalizeCode(code: any): string {
  return upper(code).replace(/\s/g, "");
}

export function couponLabel(coupon: any): string {
  return couponLine(coupon);
}

export function stateLabel(state: string): string {
  return couponStateText(state);
}
