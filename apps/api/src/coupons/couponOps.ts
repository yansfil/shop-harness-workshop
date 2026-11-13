// 쿠폰 운영: 중지·재개, 기간 연장, 수량 늘리기, 지정 고객에게 보내기, 받은 고객 보기
import {
  addDays,
  badRequest,
  comma,
  conflict,
  customerLabel,
  emit,
  endOfDay,
  fmtDot,
  fmtMdHm,
  isEmail,
  isValidDate,
  log,
  notFoundError,
  now,
  nowIso,
  splitList,
  startOfDay,
  toCsv,
  toDate,
  toInt,
  tx,
  uniq,
} from "../legacy/legacyUtils.ts";
import * as dao from "./infra/couponDao.ts";
import { couponState, stateLabel } from "./domain/couponRules.ts";

function mustCoupon(couponId: any): any {
  const coupon = dao.findById(couponId);
  if (!coupon) throw notFoundError("쿠폰을 찾을 수 없습니다.");
  return coupon;
}

function summary(couponId: any): any {
  const c = dao.findById(couponId);
  const state = couponState(c, nowIso());
  return {
    id: c.id,
    code: c.code,
    state: state,
    stateText: stateLabel(state),
    endsAt: c.ends_at,
    endsAtText: fmtDot(c.ends_at) + "까지",
    issueLimit: c.issue_limit,
    issuedCount: c.issued_count,
    usedCount: c.used_count,
    paused: !!c.paused_at,
  };
}

/** 중지: 고객이 더 이상 쓸 수 없다. 이미 쓴 주문은 그대로 */
export function pause(couponId: any): any {
  const coupon = mustCoupon(couponId);
  if (coupon.paused_at) throw conflict("COUPON_ALREADY_PAUSED", "이미 중지한 쿠폰이에요.");
  dao.setPaused(coupon.id, nowIso());
  log("coupon_paused", { couponId: coupon.id });
  return summary(coupon.id);
}

export function resume(couponId: any): any {
  const coupon = mustCoupon(couponId);
  if (!coupon.paused_at) throw conflict("COUPON_NOT_PAUSED", "중지하지 않은 쿠폰이에요.");
  dao.setPaused(coupon.id, null);
  log("coupon_resumed", { couponId: coupon.id });
  return summary(coupon.id);
}

/** 기간 연장: 끝나는 날을 뒤로만 미룰 수 있다 */
export function extend(couponId: any, endsAtInput: any): any {
  const coupon = mustCoupon(couponId);
  if (!isValidDate(endsAtInput)) throw badRequest("끝나는 날을 골라 주세요.", { fieldErrors: { endsAt: ["날짜를 골라 주세요"] } });
  const endsAt = endOfDay(endsAtInput).toISOString();
  if (endsAt <= coupon.ends_at) throw badRequest("지금 끝나는 날(" + fmtDot(coupon.ends_at) + ")보다 뒤로 골라 주세요.", { fieldErrors: { endsAt: ["지금보다 뒤여야 합니다"] } });
  if (toDate(endsAt).getTime() > addDays(now(), 366).getTime()) throw badRequest("1년 안으로 골라 주세요.", { fieldErrors: { endsAt: ["1년 안이어야 합니다"] } });
  dao.setEndsAt(coupon.id, endsAt);
  log("coupon_extended", { couponId: coupon.id, endsAt: endsAt });
  return summary(coupon.id);
}

/** 발급 수량 늘리기 */
export function raiseLimit(couponId: any, limitInput: any): any {
  const coupon = mustCoupon(couponId);
  const limit = toInt(limitInput);
  if (limit <= Number(coupon.issue_limit)) {
    throw badRequest("지금 수량(" + comma(coupon.issue_limit) + "장)보다 크게 넣어 주세요.", { fieldErrors: { issueLimit: ["지금보다 커야 합니다"] } });
  }
  if (limit > 100000) throw badRequest("10만 장까지 넣을 수 있어요.", { fieldErrors: { issueLimit: ["너무 많습니다"] } });
  dao.raiseIssueLimit(coupon.id, limit);
  log("coupon_limit_raised", { couponId: coupon.id, limit: limit });
  return summary(coupon.id);
}

/** 지정 고객에게 보내기: 이메일 목록. 이미 받은 고객과 없는 이메일은 건너뛴다 */
export function sendTo(couponId: any, emailsText: any): any {
  const coupon = mustCoupon(couponId);
  const state = couponState(coupon, nowIso());
  if (state === "expired" || state === "paused") throw conflict("COUPON_NOT_ACTIVE", stateLabel(state) + " 상태인 쿠폰은 보낼 수 없어요.");
  const emails = uniq(splitList(emailsText).map((e) => e.toLowerCase()));
  if (emails.length === 0) throw badRequest("받을 고객 이메일을 넣어 주세요.", { fieldErrors: { emails: ["한 줄에 하나씩 넣어 주세요"] } });
  const members = dao.customersByEmails(emails.filter((e) => isEmail(e)));
  const found: any = {};
  for (const m of members) found[String(m.email).toLowerCase()] = m;
  const skipped: any[] = [];
  for (const e of emails) {
    if (!isEmail(e)) skipped.push({ email: e, reason: "이메일 형식이 아니에요" });
    else if (!found[e]) skipped.push({ email: e, reason: "가입한 고객이 아니에요" });
  }
  const at = nowIso();
  const sentTo: any[] = [];
  tx(() => {
    for (const m of members) {
      const fresh = dao.findById(coupon.id);
      if (Number(fresh.issued_count) >= Number(fresh.issue_limit)) {
        skipped.push({ email: m.email, reason: "발급 수량을 다 썼어요" });
        continue;
      }
      if (dao.findWallet(coupon.id, m.id)) {
        skipped.push({ email: m.email, reason: "이미 받은 고객이에요" });
        continue;
      }
      dao.addToWallet(coupon.id, m.id, at);
      sentTo.push(m);
    }
  });
  for (const m of sentTo) emit("coupon.arrived", { userId: m.id, couponId: coupon.id, name: coupon.name, discountAmount: coupon.discount_amount, at: at });
  log("coupon_sent_to", { couponId: coupon.id, sent: sentTo.length, skipped: skipped.length });
  return { sent: sentTo.length, skipped: skipped, coupon: summary(coupon.id) };
}

/** 받은 고객 목록 */
export function holders(couponId: any): any {
  const coupon = mustCoupon(couponId);
  const rows = dao.walletHolders(coupon.id);
  let used = 0;
  for (const r of rows) if (r.used_at) used++;
  return {
    coupon: summary(coupon.id),
    usedCount: used,
    unusedCount: rows.length - used,
    holders: rows.map((r: any) => ({
      userId: r.user_id,
      customer: customerLabel(r),
      receivedAt: r.received_at,
      receivedAtText: fmtMdHm(r.received_at),
      used: !!r.used_at,
      usedAtText: r.used_at ? fmtMdHm(r.used_at) : null,
      orderId: r.order_id,
    })),
  };
}

export function holdersCsv(couponId: any): any {
  const report = holders(couponId);
  return {
    filename: "coupon-" + report.coupon.code + "-holders.csv",
    csv: toCsv(report.holders, [
      { key: "customer", title: "고객" },
      { key: "receivedAtText", title: "받은 때" },
      { key: "used", title: "사용", format: (v: any) => (v ? "사용" : "미사용") },
      { key: "usedAtText", title: "사용한 때" },
    ]),
  };
}

/** 7일 안에 끝나는 쿠폰 (관리자 화면 안내용) */
export function endingSoon(): any[] {
  const from = nowIso();
  const to = addDays(startOfDay(now()), 8).toISOString();
  return dao.endingBetween(from, to).map((c: any) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    endsAtText: fmtDot(c.ends_at),
    unused: dao.unusedWalletFor(c.id).length,
  }));
}
