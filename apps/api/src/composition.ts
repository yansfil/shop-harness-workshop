// 조립 파일: repository → service → controller를 여기서 한 번만 만들고 생성자로 넘긴다.
// 다른 파일은 의존성을 직접 new 하지 않는다.
import type { Database } from "@grabmarket/db";
import type { Clock } from "@grabmarket/shared";
import type { Express } from "express";
import { createApp } from "./app.ts";
import { HealthController } from "./shared/web/health-controller.ts";

export interface AppDependencies {
  db: Database;
  clock: Clock;
}

export function composeApp(_dependencies: AppDependencies): Express {
  return createApp([new HealthController()]);
}
