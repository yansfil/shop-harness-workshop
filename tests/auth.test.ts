import { ApiErrorResponseSchema, MeResponseSchema, ROUTES, SESSION_COOKIE_NAME } from "@grabmarket/contracts";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ACCOUNT, createTestApp, PASSWORD } from "./support/test-app.ts";

describe("로그인", () => {
  it("로그인하면 HttpOnly 세션 쿠키가 생기고 me가 같은 사용자를 돌려준다", async () => {
    const { app } = createTestApp();
    const agent = request.agent(app);

    const login = await agent.post(ROUTES.login).send({ email: ACCOUNT.customerA, password: PASSWORD }).expect(200);

    const cookie = (login.headers["set-cookie"] as unknown as string[]).join(";");
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(MeResponseSchema.parse((await agent.get(ROUTES.me).expect(200)).body).user).toMatchObject({ email: ACCOUNT.customerA, role: "customer", name: "김하늘" });
  });

  it("틀린 비밀번호와 없는 계정은 같은 이유로 거절한다", async () => {
    const { app } = createTestApp();
    for (const body of [{ email: ACCOUNT.customerA, password: "wrong-password" }, { email: "nobody@grabmarket.test", password: PASSWORD }]) {
      const response = await request(app).post(ROUTES.login).send(body).expect(401);
      expect(ApiErrorResponseSchema.parse(response.body).error.code).toBe("INVALID_CREDENTIALS");
    }
  });

  it("로그아웃하면 세션이 끝나고, 8시간이 지나도 세션이 끝난다", async () => {
    const { app, clock } = createTestApp();
    const agent = request.agent(app);
    await agent.post(ROUTES.login).send({ email: ACCOUNT.customerA, password: PASSWORD }).expect(200);
    await agent.post(ROUTES.logout).expect(204);
    await agent.get(ROUTES.me).expect(401);

    await agent.post(ROUTES.login).send({ email: ACCOUNT.customerA, password: PASSWORD }).expect(200);
    clock.advance(8 * 60 * 60 * 1000 - 1);
    await agent.get(ROUTES.me).expect(200);
    clock.advance(1);
    const expired = await agent.get(ROUTES.me).expect(401);
    expect(ApiErrorResponseSchema.parse(expired.body).error.code).toBe("UNAUTHENTICATED");
  });

  it("형식이 틀린 요청은 400과 필드별 이유로 답한다", async () => {
    const { app } = createTestApp();
    const response = await request(app).post(ROUTES.login).send({ email: "not-an-email", password: "" }).expect(400);
    expect(ApiErrorResponseSchema.parse(response.body).error).toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { email: expect.any(Array) as unknown } });
    await request(app).post(ROUTES.login).set("Content-Type", "application/json").send("{broken").expect(400);
  });
});
