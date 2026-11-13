import { z } from "zod";

/** 정수 원 금액. 서버는 Money(@grabmarket/shared)로 계산하고 JSON에는 정수로 싣는다. */
export const MoneySchema = z.number().int().nonnegative();

/** ISO-8601 UTC 시각 문자열. 예: 2026-11-14T09:00:00.000Z */
export const DateTimeSchema = z.iso.datetime();

export const IdSchema = z.number().int().positive();

/** URL 경로·쿼리의 숫자 id. 문자열을 숫자로 바꿔 검사한다. */
export const IdParamSchema = z.coerce.number().int().positive();

/** 다시 보내도 한 번만 반영되게 하는 키. 화면이 요청마다 crypto.randomUUID()로 만든다. */
export const IdempotencyKeySchema = z.uuid();

export const ErrorCodeSchema = z.enum([
  /** 400 요청 형식이 계약과 다르다. fieldErrors에 필드별 이유가 있다. */
  "VALIDATION_FAILED",
  /** 401 이메일이나 비밀번호가 틀렸다. */
  "INVALID_CREDENTIALS",
  /** 401 로그인하지 않았거나 세션이 끝났다. */
  "UNAUTHENTICATED",
  /** 403 이 계정의 역할로는 할 수 없다(고객이 관리자 API를 부를 때 등). */
  "FORBIDDEN",
  /** 403 관리자 계정은 주문할 수 없다. 화면은 고객 계정으로 로그인하라고 안내한다. */
  "ADMIN_CANNOT_ORDER",
  /** 404 없거나 이 사용자가 볼 수 없는 대상. 남의 주문도 이 코드다. */
  "NOT_FOUND",
  /** 409 결제 순간 재고가 모자라다. shortages에 상품별 부족 수량이 있다. 재고는 바뀌지 않는다. */
  "INSUFFICIENT_STOCK",
  /** 409 허용되지 않은 주문 상태 전이. */
  "INVALID_STATUS_TRANSITION",
  /** 409 취소할 수 없는 상태의 주문이다(배송중·배송완료). 주문과 재고는 바뀌지 않는다. */
  "ORDER_NOT_CANCELLABLE",
  /** 409 같은 멱등 키로 다른 내용의 요청을 보냈다. */
  "IDEMPOTENCY_KEY_REUSED",
  /** 500 서버 오류. 자세한 내용은 서버 로그에만 남는다. */
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const StockShortageSchema = z.object({
  productId: IdSchema,
  productName: z.string(),
  requested: z.number().int().positive(),
  available: z.number().int().nonnegative(),
});
export type StockShortage = z.infer<typeof StockShortageSchema>;

/** 모든 실패 응답의 모양. */
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    /** 화면에 그대로 보여도 되는 짧은 존댓말 한국어 */
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    shortages: z.array(StockShortageSchema).optional(),
  }),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const HealthResponseSchema = z.object({ status: z.literal("ok") });
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
