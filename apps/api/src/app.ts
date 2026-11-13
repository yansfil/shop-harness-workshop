import express, { type Express } from "express";
import type { Controller } from "./shared/web/controller.ts";
import { errorHandler, notFoundHandler } from "./shared/web/error-handler.ts";

/** Express 앱을 만든다. controller는 조립 파일이 만들어 넘긴다. */
export function createApp(controllers: Controller[]): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  const router = express.Router();
  for (const controller of controllers) controller.register(router);
  app.use(router);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
