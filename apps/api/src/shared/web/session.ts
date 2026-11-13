import type { Response } from "express";
import { DomainError } from "../domain/domain-error.ts";
import type { SessionUser } from "../domain/session-user.ts";

const LOCALS_KEY = "sessionUser";

/** 세션 미들웨어가 로그인한 사용자를 붙인다. */
export function attachSessionUser(res: Response, user: SessionUser): void {
  res.locals[LOCALS_KEY] = user;
}

/** 로그인한 누구나. 아니면 401. */
export function requireUser(res: Response): SessionUser {
  const user = res.locals[LOCALS_KEY] as SessionUser | undefined;
  if (user === undefined) throw new DomainError("UNAUTHENTICATED", "로그인이 필요합니다.");
  return user;
}

/** 고객만. 관리자 계정이면 403. */
export function requireCustomer(res: Response): SessionUser {
  const user = requireUser(res);
  if (user.role !== "customer") throw new DomainError("FORBIDDEN", "고객 계정으로만 이용할 수 있습니다.");
  return user;
}

/** 관리자만. 고객 계정이면 403. */
export function requireAdmin(res: Response): SessionUser {
  const user = requireUser(res);
  if (user.role !== "admin") throw new DomainError("FORBIDDEN", "관리자만 이용할 수 있습니다.");
  return user;
}
