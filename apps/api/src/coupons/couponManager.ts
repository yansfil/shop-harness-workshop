// 쿠폰 발급·지갑·적용·되돌리기
import {
  badRequest,
  comma,
  conflict,
  emit,
  fmtMd,
  isBlank,
  log,
  nowIso,
  toDate,
  toInt,
  toNumber,
  trim,
  tx,
  startOfDay,
  endOfDay,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/couponDao.ts";
import { checkApplicable, couponLabel, couponState, discountFor, normalizeCode, stateLabel, validateNewCoupon } from "./domain/couponRules.ts";

/** 관리자 목록 */
export function listForAdmin(): any {
  const at = nowIso();
  const rows = dao.listCoupons().map((c: any) => {
    const state = couponState(c, at);
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      discountAmount: c.discount_amount,
      minOrderAmount: c.min_order_amount,
      startsAt: c.starts_at,
      endsAt: c.ends_at,
      endsAtText: "~" + fmtMd(c.ends_at),
      issueLimit: c.issue_limit,
      issuedCount: c.issued_count,
      usedCount: c.used_count,
      state: state,
      stateText: stateLabel(state),
      createdAt: c.created_at,
    };
  });
  return { coupons: rows, count: rows.length };
}

/**
 * 새 쿠폰 발급. sendToCustomers면 고객 지갑에 넣고 알림을 보낸다(발급 수량까지).
 */
export function create(admin: any, input: any): any {
  const errors = validateNewCoupon(input);
  if (Object.keys(errors).length > 0) throw badRequest("입력 내용을 확인해 주세요.", { fieldErrors: errors });
  const code = normalizeCode(input.code);
  if (dao.findByCode(code)) throw badRequest("이미 있는 쿠폰 코드예요.", { fieldErrors: { code: ["이미 있는 코드입니다"] } });
  const at = nowIso();
  const startsAt = isBlank(input.startsAt) ? startOfDay(at).toISOString() : startOfDay(input.startsAt).toISOString();
  const endsAt = endOfDay(input.endsAt).toISOString();
  return tx(() => {
    const id = dao.insertCoupon({
      code: code,
      name: trim(input.name),
      discount_amount: toNumber(input.discountAmount),
      min_order_amount: toInt(input.minOrderAmount),
      starts_at: startsAt,
      ends_at: endsAt,
      issue_limit: toInt(input.issueLimit),
      issued_count: 0,
      used_count: 0,
      created_by: admin ? admin.id : null,
      created_at: at,
    });
    let sent = 0;
    if (input.sendToCustomers !== false) sent = distribute(id, at);
    log("coupon_created", { couponId: id, code: code, sent: sent });
    return { id: id, code: code, sent: sent };
  });
}

/** 고객 지갑에 나눠 준다. 발급 수량을 넘기지 않는다 */
export function distribute(couponId: any, at: string): number {
  const coupon = dao.findById(couponId);
  if (!coupon) return 0;
  const ids = dao.customerIds();
  let sent = 0;
  for (const userId of ids) {
    if (Number(coupon.issued_count) + sent >= Number(coupon.issue_limit)) break;
    if (dao.findWallet(couponId, userId)) continue;
    dao.addToWallet(couponId, userId, at);
    sent++;
    emit("coupon.arrived", { userId: userId, couponId: couponId, name: coupon.name, discountAmount: coupon.discount_amount, at: at });
  }
  return sent;
}

/** 주문서: 내 지갑의 쿠폰 */
export function walletFor(userId: any, subtotal?: any): any {
  const at = nowIso();
  const rows = dao.walletOf(userId).map((w: any) => {
    const coupon = { ...w, id: w.coupon_id };
    const used = !!w.used_at;
    const check = subtotal == null ? { ok: true } : checkApplicable(coupon, subtotal, used, at);
    const state = used ? "used" : couponState(coupon, at);
    return {
      couponId: w.coupon_id,
      code: w.code,
      name: w.name,
      label: couponLabel(w),
      discountAmount: w.discount_amount,
      minOrderAmount: w.min_order_amount,
      endsAt: w.ends_at,
      endsAtText: fmtMd(w.ends_at) + "까지",
      state: state,
      usable: !used && state === "active" && check.ok,
      reason: used ? "이미 사용한 쿠폰이에요." : check.ok ? null : check.message,
    };
  });
  return { coupons: rows, usableCount: rows.filter((r: any) => r.usable).length };
}

/** 쿠폰 코드 확인 (주문서의 "적용" 버튼) */
export function check(user: any, codeInput: any, subtotal: any): any {
  if (!user || user.role !== "customer") throw conflict("COUPON_ADMIN", "관리자 계정은 쿠폰을 쓸 수 없어요.");
  const code = normalizeCode(codeInput);
  if (isBlank(code)) throw badRequest("쿠폰 코드를 입력해 주세요.", { fieldErrors: { code: ["쿠폰 코드를 입력해 주세요"] } });
  const coupon = dao.findByCode(code);
  const at = nowIso();
  const alreadyUsed = coupon ? dao.usedBy(coupon.id, user.id) : false;
  const result = checkApplicable(coupon, subtotal, alreadyUsed, at);
  if (!result.ok) throw conflict(result.code, result.message);
  const discount = discountFor(coupon, subtotal);
  return {
    couponId: coupon.id,
    code: coupon.code,
    name: coupon.name,
    label: couponLabel(coupon),
    discount: discount,
    discountText: comma(discount) + "원",
    minOrderAmount: coupon.min_order_amount,
    endsAt: coupon.ends_at,
  };
}

/** 결제 때 쓴다. 검사를 한 번 더 하고 사용 기록을 남긴다 */
export function redeem(user: any, code: any, subtotal: any, orderId: any, at?: string): any {
  const when = at || nowIso();
  const coupon = dao.findByCode(normalizeCode(code));
  const alreadyUsed = coupon ? dao.usedBy(coupon.id, user.id) : false;
  const result = checkApplicable(coupon, subtotal, alreadyUsed, when);
  if (!result.ok) throw conflict(result.code, result.message);
  const discount = discountFor(coupon, subtotal);
  if (!dao.findWallet(coupon.id, user.id)) dao.addToWallet(coupon.id, user.id, when);
  dao.markWalletUsed(coupon.id, user.id, orderId, when);
  dao.insertRedemption({ coupon_id: coupon.id, user_id: user.id, order_id: Number(orderId), discount: discount, state: "used", created_at: when, restored_at: null });
  return { couponId: coupon.id, discount: discount, name: coupon.name };
}

/** 주문 취소 때 쿠폰을 되돌린다. 유효기간이 남았으면 다시 쓸 수 있다 */
export function restoreForOrder(orderId: any, at?: string): any {
  const when = at || nowIso();
  const redemption = dao.findRedemptionForOrder(orderId);
  if (!redemption) return null;
  dao.restoreRedemption(redemption.id, when);
  dao.clearWalletUse(redemption.coupon_id, redemption.user_id);
  log("coupon_restored", { orderId: Number(orderId), couponId: redemption.coupon_id });
  return { couponId: redemption.coupon_id, discount: redemption.discount };
}

/** 쿠폰 사용 내역 (관리자) */
export function usage(couponId: any): any {
  const coupon = dao.findById(couponId);
  if (!coupon) throw badRequest("없는 쿠폰입니다.");
  const rows = dao.redemptionsOf(couponId);
  return {
    coupon: { id: coupon.id, code: coupon.code, name: coupon.name, state: couponState(coupon, nowIso()) },
    redemptions: rows.map((r: any) => ({
      orderNumber: r.order_number,
      customerName: r.customer_name,
      discount: r.discount,
      state: r.state,
      createdAt: r.created_at,
    })),
  };
}

/** 오늘 끝나는 쿠폰 수 (대시보드용) */
export function endingToday(): number {
  const end = endOfDay(nowIso()).getTime();
  const start = startOfDay(nowIso()).getTime();
  return dao.listCoupons().filter((c: any) => {
    const t = toDate(c.ends_at).getTime();
    return t >= start && t <= end;
  }).length;
}

/** 쿠폰 한 장 (관리자 발급 응답용) */
export function findCoupon(couponId: any): any {
  return dao.findById(couponId);
}
