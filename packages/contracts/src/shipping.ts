import { z } from "zod";
import { MoneySchema } from "./common.ts";

/**
 * GET /api/shipping-policy (로그인 불필요). 배송비 규칙의 값.
 * 주문 금액이 freeThreshold 이상이면 무료, 아니면 fee. 규칙은 서버 한 곳에만 있고 화면은 이 값을 그대로 문구로 쓴다.
 */
export const ShippingPolicyResponseSchema = z.object({
  /** 무료 배송이 아닐 때의 배송비 */
  fee: MoneySchema,
  /** 이 금액 이상 주문하면 배송비 무료 */
  freeThreshold: MoneySchema,
});
export type ShippingPolicyResponse = z.infer<typeof ShippingPolicyResponseSchema>;
