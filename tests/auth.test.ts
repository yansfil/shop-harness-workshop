import { ApiErrorResponseSchema, MeResponseSchema, ROUTES, SESSION_COOKIE_NAME } from "@grabmarket/contracts";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT, createTestApp, NOW, PASSWORD } from "./support/test-app.ts";

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

  it("로그아웃하면 세션이 끝나고, 12시간이 지나도 세션이 끝난다", async () => {
    const { app, clock } = createTestApp();
    const agent = request.agent(app);
    await agent.post(ROUTES.login).send({ email: ACCOUNT.customerA, password: PASSWORD }).expect(200);
    await agent.post(ROUTES.logout).expect(204);
    await agent.get(ROUTES.me).expect(401);

    await agent.post(ROUTES.login).send({ email: ACCOUNT.customerA, password: PASSWORD }).expect(200);
    clock.advance(12 * 60 * 60 * 1000 - 1);
    await agent.get(ROUTES.me).expect(200);
    clock.advance(1);
    const expired = await agent.get(ROUTES.me).expect(401);
    expect(ApiErrorResponseSchema.parse(expired.body).error.code).toBe("UNAUTHENTICATED");
  });

  describe("테스트를 돌리는 컴퓨터 시각이 서버 Clock보다 며칠 뒤여도", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("로그인 쿠키는 받은 때부터 12시간 수명으로 내려가 로그인이 유지된다", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(new Date(NOW).getTime() + 3 * 24 * 60 * 60 * 1000));
      const { app } = createTestApp();
      const agent = request.agent(app);

      const login = await agent.post(ROUTES.login).send({ email: ACCOUNT.customerA, password: PASSWORD }).expect(200);

      expect((login.headers["set-cookie"] as unknown as string[]).join(";")).toContain("Max-Age=43200");
      await agent.get(ROUTES.me).expect(200);
    });
  });

  it("형식이 틀린 요청은 400과 필드별 이유로 답한다", async () => {
    const { app } = createTestApp();
    const response = await request(app).post(ROUTES.login).send({ email: "not-an-email", password: "" }).expect(400);
    expect(ApiErrorResponseSchema.parse(response.body).error).toMatchObject({ code: "VALIDATION_FAILED", fieldErrors: { email: expect.any(Array) as unknown } });
    await request(app).post(ROUTES.login).set("Content-Type", "application/json").send("{broken").expect(400);
  });
});
