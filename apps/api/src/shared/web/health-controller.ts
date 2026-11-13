import { type HealthResponse, ROUTES } from "@grabmarket/contracts";
import type { Router } from "express";
import type { Controller } from "./controller.ts";

export class HealthController implements Controller {
  register(router: Router): void {
    router.get(ROUTES.health, (_req, res) => {
      const body: HealthResponse = { status: "ok" };
      res.json(body);
    });
  }
}
