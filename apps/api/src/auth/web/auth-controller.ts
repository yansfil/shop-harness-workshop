import { LoginRequestSchema, ROUTES, SESSION_COOKIE_NAME } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "../../shared/web/controller.ts";
import { requireUser } from "../../shared/web/session.ts";
import type { AuthService } from "../application/auth-service.ts";
import { toMeResponse } from "./auth-mapper.ts";
import { readCookie } from "./session-middleware.ts";

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/" } as const;

export class AuthController implements Controller {
  readonly #auth: AuthService;

  constructor(auth: AuthService) {
    this.#auth = auth;
  }

  register(router: Router): void {
    router.post(ROUTES.login, (req, res) => {
      const { email, password } = LoginRequestSchema.parse(req.body);
      const result = this.#auth.login(email, password);
      res.cookie(SESSION_COOKIE_NAME, result.token, { ...COOKIE_OPTIONS, expires: result.expiresAt });
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
