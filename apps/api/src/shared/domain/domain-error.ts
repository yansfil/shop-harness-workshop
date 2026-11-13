/** 도메인·서비스가 던지는 오류의 종류. web 계층의 오류 처리기가 같은 이름의 계약 ErrorCode로 바꾼다. */
export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "ADMIN_CANNOT_ORDER"
  | "NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "INVALID_STATUS_TRANSITION"
  | "IDEMPOTENCY_KEY_REUSED";

export interface StockShortage {
  productId: number;
  productName: string;
  requested: number;
  available: number;
}

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly shortages: StockShortage[] | undefined;

  /** message는 화면에 그대로 보여도 되는 짧은 존댓말이다. */
  constructor(code: DomainErrorCode, message: string, shortages?: StockShortage[]) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.shortages = shortages;
  }
}

export function notFound(what: string): DomainError {
  return new DomainError("NOT_FOUND", `${what}을(를) 찾을 수 없습니다.`);
}
