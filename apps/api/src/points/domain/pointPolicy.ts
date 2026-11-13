// 포인트 규칙
// 1P = 1원. 결제 금액의 1%를 적립하고, 보유분 안에서 결제 금액을 넘지 않게 쓴다. 적립 1년 뒤 소멸 배치가 지운다.

import { CONFIG, addDays, toInt, toNumber, POINT_KIND_TEXT, pointText } from "../../legacy/legacyUtils.ts";

export const POINT_KINDS = ["earn", "use", "expire", "refund", "admin"];

/** 결제 금액에 대한 적립 포인트: 결제 금액의 1%, 1P 미만은 버린다(정수 계산) */
export function calcRewardPoints(paidAmount: any): number {
  const paid = toInt(paidAmount);
  if (paid <= 0) return 0;
  return Math.floor(paid / 100);
}

/** 이번 주문에서 쓸 수 있는 최대 포인트 */
export function maxUsablePoints(balance: any, payable: any): number {
  const b = toInt(balance);
  const p = toInt(payable);
  if (b <= 0 || p <= 0) return 0;
  return b < p ? b : p;
}

/** 사용 포인트 검사. 문제가 없으면 null */
export function checkUsePoints(points: any, balance: any, payable: any): any {
  const n = toNumber(points);
  if (n === 0) return null;
  if (!Number.isInteger(n) || n < 0) return { code: "POINT_INVALID", message: "포인트는 1P 단위로 입력해 주세요." };
  if (n < CONFIG.POINT_MIN_USE) return { code: "POINT_TOO_SMALL", message: pointText(CONFIG.POINT_MIN_USE) + " 이상부터 쓸 수 있어요." };
  if (n > toInt(balance)) return { code: "POINT_NOT_ENOUGH", message: "보유 포인트보다 많이 쓸 수 없어요. 보유 " + pointText(balance) };
  if (n > toInt(payable)) return { code: "POINT_OVER_PAYABLE", message: "결제 금액보다 많이 쓸 수 없어요." };
  return null;
}

export function expiresAtFor(earnedAt: any): string {
  return addDays(earnedAt, CONFIG.POINT_EXPIRE_DAYS).toISOString();
}

export function kindText(kind: any): string {
  return POINT_KIND_TEXT[kind] || String(kind);
}

/** 내역 한 줄의 설명 */
export function ledgerDescription(row: any): string {
  if (row.kind === "expire") return "유효기간이 끝났어요";
  if (row.kind === "admin") return row.memo || "관리자 조정";
  if (row.order_number) return "주문 " + shortNo(row.order_number);
  return row.memo || kindText(row.kind);
}

function shortNo(orderNumber: string): string {
  const m = /^GM-\d{8}-(\d{4})$/.exec(orderNumber);
  return m ? "GM-" + m[1] : orderNumber;
}

/** 부호: 적립·환불은 +, 사용·소멸은 − */
export function signedAmount(kind: any, amount: any): number {
  const n = Math.abs(toInt(amount));
  if (kind === "use" || kind === "expire") return -n;
  if (kind === "admin") return toInt(amount);
  return n;
}
