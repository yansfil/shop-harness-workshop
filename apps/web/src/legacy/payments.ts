// 내 주문의 실제 결제 금액(쿠폰·포인트를 뺀 값). 주문 목록·주문 완료 화면이 주문 합계 대신 쓴다.
import { legacyGet } from "./legacyApi.ts";

export interface PaidInfo {
  orderId: number;
  paidAmount: number;
  couponDiscount: number;
  pointUsed: number;
  refundedAmount: number;
}

export async function myPayments(): Promise<Map<number, PaidInfo>> {
  const data = await legacyGet("/api/me/payments");
  return new Map((data.payments as PaidInfo[]).map((p) => [p.orderId, p]));
}
