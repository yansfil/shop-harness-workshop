import type { ApiErrorResponse } from "@grabmarket/contracts";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { flattenError, ZodError } from "zod";
import { DomainError } from "../domain/domain-error.ts";
import { ERROR_STATUS } from "./api-error.ts";

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorResponse = { error: { code: "NOT_FOUND", message: "찾을 수 없습니다." } };
  res.status(404).json(body);
};

/** 모든 실패를 ApiErrorResponse 모양으로 바꾼다. 예상하지 못한 오류는 자세한 내용을 로그에만 남긴다. */
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (error instanceof DomainError) {
    const body: ApiErrorResponse = { error: { code: error.code, message: error.message } };
    if (error.shortages !== undefined) body.error.shortages = error.shortages;
    res.status(ERROR_STATUS[error.code]).json(body);
    return;
  }
  if (error instanceof ZodError) {
    const body: ApiErrorResponse = {
      error: { code: "VALIDATION_FAILED", message: "요청 형식이 올바르지 않습니다.", fieldErrors: flattenError(error).fieldErrors },
    };
    res.status(400).json(body);
    return;
  }
  if (isBodyParseError(error)) {
    const body: ApiErrorResponse = { error: { code: "VALIDATION_FAILED", message: "요청 본문을 읽을 수 없습니다." } };
    res.status(400).json(body);
    return;
  }
  console.error(
    JSON.stringify({
      event: "request_failed",
      method: req.method,
      path: req.path,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    }),
  );
  const body: ApiErrorResponse = { error: { code: "INTERNAL_ERROR", message: "잠시 뒤 다시 시도해 주세요." } };
  res.status(500).json(body);
};

/** express.json이 던지는 잘못된 JSON 오류 */
function isBodyParseError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed";
}
