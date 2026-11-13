import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderApp } from "../test/render-app.tsx";
import { search, installFakeApi } from "../test/fake-api.ts";

const api = installFakeApi();

const results = () => screen.getByRole("region", { name: "검색 결과" });
const names = () => within(results()).getAllByRole("link").map((link) => link.textContent);

describe("검색 결과", () => {
  it("총 개수와 정렬 3종을 보이고 페이지 번호나 더보기는 없다", async () => {
    renderApp("/search?q=" + encodeURIComponent("감귤"));

    expect(await screen.findByText("총 3개")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "'감귤' 검색 결과" })).toBeInTheDocument();
    const sorts = screen.getByRole("group", { name: "정렬" });
    expect(within(sorts).getAllByRole("button").map((button) => button.textContent)).toEqual(["기본", "낮은 가격", "높은 가격"]);
    expect(screen.queryByRole("button", { name: /더보기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /페이지/ })).not.toBeInTheDocument();
  });

  it("낮은 가격순으로 바꾸면 값 순서로 다시 나온다", async () => {
    renderApp("/search?q=" + encodeURIComponent("감귤"));
    await screen.findByText("총 3개");

    await userEvent.click(within(screen.getByRole("group", { name: "정렬" })).getByRole("button", { name: "낮은 가격" }));

    await waitFor(() => {
      expect(names().map((text) => text.replace(/\s+/g, " ").trim().slice(0, 9))).toEqual(["감귤 젤리 12개", "제주 감귤 3kg", "하우스 감귤 2k"]);
    });
  });

  it("카드는 이름·큰 가격과 품절·남은 수량 적음을 보이고 별점이나 할인율은 없다", async () => {
    renderApp("/search?q=" + encodeURIComponent("감귤"));
    await screen.findByText("총 3개");

    const jelly = screen.getByRole("link", { name: /감귤 젤리 12개입/ });
    expect(within(jelly).getByText("품절")).toBeInTheDocument();
    expect(within(jelly).getByText("7,900")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /하우스 감귤 2kg/ })).getByText("남은 수량 적음")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /제주 감귤 3kg/ })).getByText("내일 도착")).toBeInTheDocument();
    expect(results().textContent).not.toMatch(/%|★|리뷰/);
  });
});

describe("필터", () => {
  it("카테고리 칩에 개수가 있고, 개수가 0인 칩은 누를 수 없다", async () => {
    renderApp("/search?q=" + encodeURIComponent("감귤"));
    await screen.findByText("총 3개");

    const filters = screen.getByRole("complementary", { name: "필터" });
    expect(within(filters).getByRole("button", { name: /^전체\s*3$/ })).toBeInTheDocument();
    expect(within(filters).getByRole("button", { name: /^식품\s*3$/ })).toBeEnabled();
    expect(within(filters).getByRole("button", { name: /^생활\s*0$/ })).toBeDisabled();
  });

  it("품절 제외를 켜면 결과와 총 개수가 바로 바뀌고 끄면 원래대로 돌아온다", async () => {
    renderApp("/search?q=" + encodeURIComponent("감귤"));
    await screen.findByText("총 3개");
    const toggle = within(screen.getByRole("complementary", { name: "필터" })).getByRole("switch", { name: "품절 제외" });

    await userEvent.click(toggle);
    expect(await screen.findByText("총 2개")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /감귤 젤리/ })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    expect(await screen.findByText("총 3개")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /감귤 젤리/ })).toBeInTheDocument();
  });

  it("가격 구간을 고르면 그 범위만 남고, 카테고리 칩을 고르면 그 카테고리만 남는다", async () => {
    renderApp("/search");
    await screen.findByText("총 6개");
    const filters = within(screen.getByRole("complementary", { name: "필터" }));

    await userEvent.click(filters.getByRole("checkbox", { name: "1만원~2만원" }));
    expect(await screen.findByText("총 3개")).toBeInTheDocument();
    expect(names().join(" ")).toMatch(/제주 감귤 3kg/);
    expect(names().join(" ")).not.toMatch(/헤드폰/);

    await userEvent.click(filters.getByRole("checkbox", { name: "1만원~2만원" }));
    await screen.findByText("총 6개");
    await userEvent.click(filters.getByRole("button", { name: /^가전\s*1$/ }));
    expect(await screen.findByText("총 1개")).toBeInTheDocument();
    expect(names().join(" ")).toMatch(/헤드폰/);

    await userEvent.click(filters.getByRole("button", { name: /^전체\s*6$/ }));
    expect(await screen.findByText("총 6개")).toBeInTheDocument();
  });

  it("필터 때문에 결과가 비면 필터 풀기를 주고, 풀면 결과가 돌아온다", async () => {
    renderApp("/search?q=" + encodeURIComponent("감귤") + "&minPrice=30000");

    expect(await screen.findByText(/에 조건이 맞는 상품이 없어요/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "필터 풀기" }));

    expect(await screen.findByText("총 3개")).toBeInTheDocument();
  });
});

describe("결과 없음", () => {
  it("다른 상품으로 채우지 않고 안내·철자 팁·카테고리 칩 4개·전체 상품 보기를 보인다", async () => {
    renderApp("/search?q=" + encodeURIComponent("ㅁㄴㅇㄹ"));

    expect(await screen.findByRole("heading", { name: "'ㅁㄴㅇㄹ'에 맞는 상품이 없어요" })).toBeInTheDocument();
    expect(screen.getByText("철자를 확인하거나 더 짧은 말로 찾아보세요")).toBeInTheDocument();
    expect(screen.getByText("띄어쓰기를 바꿔 보세요")).toBeInTheDocument();
    const main = screen.getByRole("main");
    expect(within(main).getAllByRole("link").map((link) => link.textContent)).toEqual(["식품4", "생활1", "가전1", "패션0", "전체 상품 보기"]);
    expect(within(main).getByRole("link", { name: "전체 상품 보기" })).toHaveAttribute("href", "/");
    expect(screen.queryByText(/^총 /)).not.toBeInTheDocument();
  });
});

describe("검색 결과 실패", () => {
  it("못 불러오면 안내와 다시 시도를 보이고, 다시 시도하면 결과가 나온다", async () => {
    let calls = 0;
    api.on("GET /api/products", ({ url }) => {
      calls += 1;
      return calls === 1 ? { status: 500, json: { error: { code: "INTERNAL_ERROR", message: "서버 오류" } } } : { json: search(url.searchParams) };
    });
    renderApp("/search?q=" + encodeURIComponent("감귤"));

    expect(await screen.findByText("검색 결과를 불러오지 못했어요")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("총 3개")).toBeInTheDocument();
  });
});
