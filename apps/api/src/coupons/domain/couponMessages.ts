// 쿠폰 안내 문구
import { comma, fmtMd, won } from "../../legacy/legacyUtils.ts";

export const COUPON_MESSAGES: any = {
  NOT_FOUND: "없는 쿠폰 코드예요. 코드를 다시 확인해 주세요.",
  NOT_STARTED: "아직 쓸 수 없는 쿠폰이에요.",
  EXPIRED: "유효기간이 끝난 쿠폰이에요.",
  EXHAUSTED: "준비된 수량이 모두 사용된 쿠폰이에요.",
  ALREADY_USED: "이미 사용한 쿠폰이에요.",
  MIN_ORDER: "최소 주문 금액을 채우지 못했어요.",
  ONE_PER_ORDER: "쿠폰은 주문당 한 장만 쓸 수 있어요.",
  ADMIN: "관리자 계정은 쿠폰을 쓸 수 없어요.",
  PAUSED: "지금은 잠시 쓸 수 없는 쿠폰이에요.",
  INVALID_AMOUNT: "할인 금액이 올바르지 않은 쿠폰이라 쓸 수 없어요.",
};

export function minOrderMessage(minOrder: any, subtotal: any): string {
  const lack = Number(minOrder) - Number(subtotal);
  return "최소 주문 금액 " + won(minOrder) + " 이상부터 쓸 수 있어요. " + won(lack) + " 더 담아 주세요.";
}

export function expiredMessage(endsAt: any): string {
  return "유효기간이 " + fmtMd(endsAt) + "에 끝난 쿠폰이에요.";
}

export function notStartedMessage(startsAt: any): string {
  return fmtMd(startsAt) + "부터 쓸 수 있는 쿠폰이에요.";
}

/** "11월 장바구니 쿠폰 · 2,000원 할인" */
export function couponLine(coupon: any): string {
  return coupon.name + " · " + comma(coupon.discount_amount) + "원 할인";
}

export function couponStateText(state: string): string {
  if (state === "active") return "사용 가능";
  if (state === "scheduled") return "시작 전";
  if (state === "expired") return "만료";
  if (state === "exhausted") return "소진";
  if (state === "paused") return "중지";
  return state;
}
