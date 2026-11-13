import express, { type Express, type RequestHandler } from "express";
import type { Controller } from "./shared/web/controller.ts";
import { errorHandler, notFoundHandler } from "./shared/web/error-handler.ts";

/** Express 앱을 만든다. 세션 미들웨어는 controller보다 먼저 걸리고, 둘 다 조립 파일이 만들어 넘긴다. */
export function createApp(sessionMiddleware: RequestHandler, controllers: Controller[]): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(sessionMiddleware);
  const router = express.Router();
  for (const controller of controllers) controller.register(router);
  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
