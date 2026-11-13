import { HealthResponseSchema, ROUTES } from "@grabmarket/contracts";
import { createTestDatabase } from "@grabmarket/db";
import { FixedClock } from "@grabmarket/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { composeApp } from "../apps/api/src/composition.ts";

const app = composeApp({ db: createTestDatabase(), clock: new FixedClock("2026-11-14T00:00:00.000Z") });

describe("API 조립", () => {
  it("health는 계약 모양으로 ok를 준다", async () => {
    const response = await request(app).get(ROUTES.health).expect(200);
    expect(HealthResponseSchema.parse(response.body)).toEqual({ status: "ok" });
  });

  it("없는 경로는 404 NOT_FOUND 오류 모양으로 답한다", async () => {
    const response = await request(app).get("/api/nope").expect(404);
    expect(response.body).toEqual({ error: { code: "NOT_FOUND", message: "찾을 수 없습니다." } });
  });
});
