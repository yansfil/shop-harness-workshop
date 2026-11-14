import { LoginRequestSchema, ROUTES, SESSION_COOKIE_NAME } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import { requireUser } from "../../shared/web/session.ts";
import type { AuthService } from "../application/auth-service.ts";
import { SESSION_TTL_MS } from "../domain/session.ts";
import { toMeResponse } from "./auth-mapper.ts";
import { readCookie } from "./session-middleware.ts";

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/" } as const;

// 쿠키 수명은 절대 시각(expires) 대신 받은 때부터 세는 Max-Age로 내린다.
// 서버 Clock과 클라이언트 시계가 달라도 같은 12시간을 쓰고, 실제 만료 판단은 서버 세션이 Clock으로 한다.
const SESSION_COOKIE_OPTIONS = { ...COOKIE_OPTIONS, maxAge: SESSION_TTL_MS } as const;

export class AuthController implements Controller {
  readonly #auth: AuthService;

  constructor(auth: AuthService) {
    this.#auth = auth;
  }

  register(router: Router): void {
    router.post(ROUTES.login, (req, res) => {
      const { email, password } = LoginRequestSchema.parse(req.body);
      const result = this.#auth.login(email, password);
      res.cookie(SESSION_COOKIE_NAME, result.token, SESSION_COOKIE_OPTIONS);
      res.json(toMeResponse(result.user));
    });

    router.post(ROUTES.logout, (req, res) => {
      this.#auth.logout(readCookie(req.headers.cookie, SESSION_COOKIE_NAME));
      res.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
      res.status(204).end();
    });

    router.get(ROUTES.me, (_req, res) => {
      res.json(toMeResponse(requireUser(res)));
    });
  }
}
