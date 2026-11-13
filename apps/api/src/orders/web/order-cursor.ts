import { z } from "zod";
import type { OrderPosition } from "../domain/order.ts";

/** 커서는 목록에서 한 주문의 자리(주문 시각|id)를 base64url로 감싼 값이다. 화면은 뜻을 몰라도 그대로 돌려보내면 된다. */
export function encodeOrderCursor(position: OrderPosition): string {
  return Buffer.from(`${position.createdAt.toISOString()}|${position.id}`).toString("base64url");
}

/** 형식이 틀린 커서는 VALIDATION_FAILED(400)로 거절한다. */
export const OrderCursorSchema = z.string().transform((value, ctx): OrderPosition => {
  const [at = "", id = ""] = Buffer.from(value, "base64url").toString().split("|");
  const createdAt = new Date(at);
  const orderId = Number(id);
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== at || !Number.isInteger(orderId) || orderId <= 0) {
    ctx.addIssue({ code: "custom", message: "올바르지 않은 커서입니다" });
    return z.NEVER;
  }
  return { createdAt, id: orderId };
});
