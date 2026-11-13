import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render-app.tsx";
import { installFakeApi } from "../test/fake-api.ts";

const api = installFakeApi();

async function focusSearch(path = "/", saved?: { recent?: string[] }) {
  const router = renderApp(path, saved);
  const input = await screen.findByRole("textbox", { name: "상품 검색" });
  await userEvent.click(input);
  return { router, input };
}

const productRows = () =>
  within(screen.getByRole("region", { name: "검색어 도우미" }))
    .getAllByRole("link")
    .filter((link) => link.getAttribute("href")?.startsWith("/products/"));

describe("검색창을 눌렀을 때 (B44)", () => {
  it("최근 검색어를 보이고 하나씩 지울 수 있다", async () => {
    await focusSearch("/", { recent: ["감귤", "수건 3장", "쌀 2kg"] });

    expect(screen.getByRole("heading", { name: "최근 검색어" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "감귤" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "최근 검색어 '수건 3장' 삭제" }));

    expect(screen.queryByRole("button", { name: "수건 3장" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "감귤" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("grabmarket.recent-searches") ?? "[]")).toEqual(["감귤", "쌀 2kg"]);
  });

  it("전체 지우기를 누르면 최근 검색어가 모두 사라지고 카테고리 칩이 보인다", async () => {
    await focusSearch("/", { recent: ["감귤", "쌀 2kg"] });

    await userEvent.click(screen.getAllByRole("button", { name: "전체 지우기" })[0] as HTMLElement);

    expect(screen.queryByRole("button", { name: "감귤" })).not.toBeInTheDocument();
    expect(screen.getByText("아직 검색한 상품이 없어요")).toBeInTheDocument();
  });

  it("최근 검색어가 없으면 카테고리 4개 칩을 보이고 누르면 그 카테고리로 간다", async () => {
    const { router } = await focusSearch();

    const chips = screen.getByRole("heading", { name: "카테고리로 찾아보기" }).parentElement;
    if (chips === null) throw new Error("칩 영역이 없습니다");
    expect(within(chips).getAllByRole("link").map((link) => link.textContent)).toEqual(["식품", "생활", "가전", "패션"]);

    await userEvent.click(within(chips).getByRole("link", { name: "가전" }));
    expect(router.state.location.pathname).toBe("/category/electronics");
  });

  it("검색어를 보내면 최근 검색어에 맨 앞으로 저장되고 결과 화면으로 간다", async () => {
    const { router, input } = await focusSearch("/", { recent: ["쌀 2kg"] });

    await userEvent.type(input, "귤{Enter}");

    expect(router.state.location.pathname).toBe("/search");
    expect(router.state.location.search).toBe("?q=%EA%B7%A4");
    expect(JSON.parse(localStorage.getItem("grabmarket.recent-searches") ?? "[]")).toEqual(["귤", "쌀 2kg"]);
  });
});

describe("글자를 칠 때 자동완성 (B48)", () => {
  it("이름이 일치하는 상품을 최대 8줄 보이고 친 글자를 굵게 강조한다", async () => {
    const { input } = await focusSearch();

    await userEvent.type(input, "귤");

    const row = await screen.findByRole("link", { name: "제주 감귤 3kg" });
    expect(within(row).getByText("귤", { selector: "strong" })).toBeInTheDocument();
    expect(within(row).getByText("제주 감", { selector: "span" })).toBeInTheDocument();
    expect(productRows()).toHaveLength(3);
  });

  it("상품이 8개보다 많이 일치해도 8줄까지만 보인다", async () => {
    api.on("GET /api/products/suggest", () => ({
      json: { category: null, products: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `감귤 상품 ${index + 1}` })) },
    }));
    const { input } = await focusSearch();

    await userEvent.type(input, "감귤");

    await screen.findByRole("link", { name: "감귤 상품 1" });
    expect(productRows()).toHaveLength(8);
  });

  it("맨 위에 카테고리 제안 한 줄이 있고 누르면 그 카테고리의 검색 결과로 간다", async () => {
    const { router, input } = await focusSearch();

    await userEvent.type(input, "귤");
    const suggestion = await screen.findByRole("link", { name: /귤 · 식품에서 보기/ });
    await userEvent.click(suggestion);

    expect(router.state.location.pathname).toBe("/search");
    expect(new URLSearchParams(router.state.location.search).get("category")).toBe("food");
    expect(new URLSearchParams(router.state.location.search).get("q")).toBe("귤");
  });

  it("상품 줄을 고르면 그 상품 상세로 간다", async () => {
    const { router, input } = await focusSearch();

    await userEvent.type(input, "귤");
    await userEvent.click(await screen.findByRole("link", { name: "하우스 감귤 2kg" }));

    expect(router.state.location.pathname).toBe("/products/2");
  });

  it("화살표로 줄을 고르고 Enter로 이동하며 Esc로 닫는다", async () => {
    const { router, input } = await focusSearch();

    await userEvent.type(input, "귤");
    await screen.findByRole("link", { name: "제주 감귤 3kg" });
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(router.state.location.pathname).toBe("/products/1");
  });

  it("Esc를 누르면 레이어가 닫힌다", async () => {
    const { input } = await focusSearch("/", { recent: ["감귤"] });
    expect(screen.getByRole("heading", { name: "최근 검색어" })).toBeInTheDocument();

    await userEvent.type(input, "{Escape}");

    expect(screen.queryByRole("heading", { name: "최근 검색어" })).not.toBeInTheDocument();
  });

  it("자동완성을 못 불러오면 안내하고 검색은 그대로 할 수 있다", async () => {
    api.on("GET /api/products/suggest", () => ({ status: 500, json: { error: { code: "INTERNAL_ERROR", message: "서버 오류" } } }));
    const { router, input } = await focusSearch();

    await userEvent.type(input, "귤");
    expect(await screen.findByText(/자동완성을 불러오지 못했어요/)).toBeInTheDocument();

    await userEvent.type(input, "{Enter}");
    expect(router.state.location.pathname).toBe("/search");
  });
});
