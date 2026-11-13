import { SESSION_COOKIE_NAME } from "@grabmarket/contracts";
import type { RequestHandler } from "express";
import { attachSessionUser } from "../../shared/web/session.ts";
import type { AuthService } from "../application/auth-service.ts";

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      try {
        return decodeURIComponent(part.slice(separator + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** 모든 라우트보다 먼저 거는 미들웨어: 세션 쿠키가 유효하면 로그인한 사용자를 붙인다. 판단(401·403)은 라우트가 한다. */
export function createSessionMiddleware(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    const user = auth.authenticate(readCookie(req.headers.cookie, SESSION_COOKIE_NAME));
    if (user !== undefined) attachSessionUser(res, user);
    next();
  };
}
