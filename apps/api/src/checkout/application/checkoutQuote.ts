// 주문서 금액 미리 보기: 상품 합계·배송비에 쿠폰 할인과 포인트 사용을 더해 결제 금액을 계산한다
import { CartLineSchema } from "@grabmarket/contracts";
import { z } from "zod";
import { LegacyError, badRequest, comma, getServices, isBlank, pointText, toInt, trim } from "../../legacy/legacyUtils.ts";
import * as couponManager from "../../coupons/couponManager.ts";
import { getBalance } from "../../points/pointManager.ts";
import { checkUsePoints, maxUsablePoints } from "../../points/domain/pointPolicy.ts";

const ItemsSchema = z.array(CartLineSchema).min(1).max(50);

/**
 * 쿠폰이 안 맞거나 포인트가 넘쳐도 오류로 끊지 않고 problem으로 돌려준다(주문서가 이유를 보이게).
 * 적립 예정 포인트는 화면이 계산한다.
 */
export function quoteCheckout(user: any, body: any): any {
  const parsed = ItemsSchema.safeParse(body.items);
  if (!parsed.success) throw badRequest("주문할 상품을 확인해 주세요.", { fieldErrors: { items: ["상품을 1개 이상 담아 주세요"] } });
  const quote = getServices().orders.quote(parsed.data);
  const couponCode = trim(body.couponCode);
  let coupon: any = null;
  let couponProblem: any = null;
  if (!isBlank(couponCode)) {
    try {
      coupon = couponManager.check(user, couponCode, quote.subtotal);
    } catch (e: any) {
      if (!(e instanceof LegacyError)) throw e;
      couponProblem = { code: e.code, message: e.message };
    }
  }
  const discount = coupon ? coupon.discount : 0;
  const payable = quote.total - discount;
  const balance = getBalance(user.id);
  const maxPoints = maxUsablePoints(balance, payable);
  let usePoints = toInt(body.usePoints);
  const pointProblem = checkUsePoints(usePoints, balance, payable);
  if (pointProblem) usePoints = 0;
  const wallet = couponManager.walletFor(user.id, quote.subtotal);
  return {
    items: quote.items,
    subtotal: quote.subtotal,
    shippingFee: quote.shippingFee,
    total: quote.total,
    shortages: quote.shortages,
    coupon: coupon ? { code: coupon.code, name: coupon.name, label: coupon.label, discount: coupon.discount } : null,
    couponProblem: couponProblem,
    couponDiscount: discount,
    usableCoupons: wallet.coupons.filter((c: any) => c.usable).map((c: any) => ({ code: c.code, label: c.label, discountAmount: c.discountAmount, endsAtText: c.endsAtText })),
    pointBalance: balance,
    pointBalanceText: pointText(balance),
    maxPoints: maxPoints,
    usePoints: usePoints,
    pointProblem: pointProblem,
    paidAmount: payable - usePoints,
    paidAmountText: comma(payable - usePoints) + "원",
  };
}
