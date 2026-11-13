import type { ErrorCode, StockShortage } from "@grabmarket/contracts";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  ADMIN_CANNOT_ORDER: 403,
  NOT_FOUND: 404,
  INSUFFICIENT_STOCK: 409,
  INVALID_STATUS_TRANSITION: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  INTERNAL_ERROR: 500,
};

/** web 계층이 던지는 계약 오류. 도메인·서비스 오류는 각 모듈의 web 계층에서 이것으로 바꾼다. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly shortages: StockShortage[] | undefined;

  constructor(code: ErrorCode, message: string, shortages?: StockShortage[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.shortages = shortages;
  }
}
