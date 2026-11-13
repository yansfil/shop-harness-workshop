import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "./test/render-app.tsx";
import { installFakeApi } from "./test/fake-api.ts";

const api = installFakeApi();

describe("router", () => {
  it("홈에서 그랩마켓 로고와 전체 상품 목록을 보인다", async () => {
    renderApp("/");
    expect(await screen.findByRole("link", { name: "그랩마켓" })).toHaveAttribute("href", "/");
    expect(await screen.findByRole("heading", { name: /전체 상품/ })).toBeInTheDocument();
  });

  it("없는 경로는 찾을 수 없음 안내와 홈 링크를 보인다", async () => {
    renderApp("/nope");
    expect(await screen.findByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈으로 가기" })).toHaveAttribute("href", "/");
  });

  it("주소창으로 /logout을 열면 로그아웃하고 홈으로 간다", async () => {
    api.on("POST /api/auth/logout", () => ({ status: 204 }));
    const router = renderApp("/logout");
    expect(await screen.findByRole("heading", { name: /전체 상품/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
    expect(api.requests).toContain("POST /api/auth/logout");
  });
});
