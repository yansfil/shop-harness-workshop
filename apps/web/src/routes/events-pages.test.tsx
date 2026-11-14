import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

installFakeApi();

describe("홈 배너와 기획전 줄", () => {
  it("첫 배너는 첫 기획전이고 누르면 그 기획전 상세 주소로 간다", async () => {
    const router = renderApp("/");
    const banner = await screen.findByRole("region", { name: "기획전 배너" });

    expect(within(banner).getByText("겨울 채비, 따뜻하게")).toBeInTheDocument();
    expect(within(banner).getByText("11월 14일 ~ 11월 30일")).toBeInTheDocument();
    await userEvent.click(within(banner).getByRole("link", { name: "겨울 채비, 따뜻하게 기획전 보기" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/events/winter-ready");
    });
  });

  it("다음·이전 버튼과 점으로 배너를 넘긴다(끝에서는 처음으로 돌아간다)", async () => {
    renderApp("/");
    const banner = await screen.findByRole("region", { name: "기획전 배너" });

    await userEvent.click(within(banner).getByRole("button", { name: "다음 기획전" }));
    expect(within(banner).getByText("제철 감귤 모음")).toBeInTheDocument();
    expect(within(banner).getByRole("button", { name: "제철 감귤 모음 배너 보기" })).toHaveAttribute("aria-current", "true");

    await userEvent.click(within(banner).getByRole("button", { name: "다음 기획전" }));
    expect(within(banner).getByText("겨울 채비, 따뜻하게")).toBeInTheDocument();

    await userEvent.click(within(banner).getByRole("button", { name: "이전 기획전" }));
    expect(within(banner).getByText("제철 감귤 모음")).toBeInTheDocument();

    await userEvent.click(within(banner).getByRole("button", { name: "겨울 채비, 따뜻하게 배너 보기" }));
    expect(within(banner).getByText("겨울 채비, 따뜻하게")).toBeInTheDocument();
  });

  it("기획전마다 상품 줄과 전체 보기가 있고 그 아래에 전체 상품이 이어진다", async () => {
    renderApp("/");
    const row = await screen.findByRole("region", { name: "제철 감귤 모음" });

    expect(within(row).getByRole("link", { name: "제철 감귤 모음 전체 보기" })).toHaveAttribute("href", "/events/tangerine-season");
    expect(within(row).getAllByRole("link", { name: /감귤|기본/ }).map((link) => link.getAttribute("href"))).toEqual(
      expect.arrayContaining(["/products/1", "/products/2", "/products/3"]),
    );
    expect(await screen.findByRole("heading", { name: /전체 상품/ })).toBeInTheDocument();
  });

  it("머리 메뉴 맨 끝 항목이 기획전이다", async () => {
    renderApp("/");
    const nav = await screen.findByRole("navigation", { name: "카테고리" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["전체", "식품", "생활", "가전", "패션", "기획전"]);
    expect(links.at(-1)).toHaveAttribute("href", "/events");
  });
});

describe("기획전 목록", () => {
  it("기획전을 카드로 보여 주고 카드마다 기간 글자와 상품 수가 있다", async () => {
    renderApp("/events");
    expect(await screen.findByText("2개")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^기획전/ })).toBeInTheDocument();

    const card = screen.getByRole("link", { name: /제철 감귤 모음/ });
    expect(card).toHaveAttribute("href", "/events/tangerine-season");
    expect(within(card).getByText("11월 10일 ~ 12월 7일")).toBeInTheDocument();
    expect(within(card).getByText("상품 3개")).toBeInTheDocument();
  });
});

describe("기획전 상세", () => {
  it("배너 머리(제목·소개·기간)와 상품 카드를 보이고 카드를 누르면 상품 상세로 간다", async () => {
    const router = renderApp("/events/tangerine-season");

    expect(await screen.findByRole("heading", { level: 1, name: "제철 감귤 모음" })).toBeInTheDocument();
    expect(screen.getByText("상자째 받는 감귤부터 주스·젤리까지 모았어요.")).toBeInTheDocument();
    expect(screen.getByText("11월 10일 ~ 12월 7일")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /기획전 상품/ })).toHaveTextContent("3개");

    const card = screen.getByRole("link", { name: /제주 감귤 3kg/ });
    expect(within(card).getByText("17,900")).toBeInTheDocument();
    await userEvent.click(card);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/products/1");
    });
  });

  it("없는 기획전은 찾을 수 없다는 안내와 목록 링크를 보인다", async () => {
    renderApp("/events/no-such-event");

    expect(await screen.findByRole("heading", { name: "기획전을 찾을 수 없어요" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "기획전 목록 보기" })).toHaveAttribute("href", "/events");
  });
});
