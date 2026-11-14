import type { ProductDetailResponse } from "@grabmarket/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi, PRODUCTS } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

const api = installFakeApi();

const STORY: ProductDetailResponse["product"]["story"] = {
  eyebrow: "제철 과일",
  headline: "겨울 내내 손이 가는\n제주 감귤 한 상자",
  intro: "제주에서 수확한 감귤을 상자에 담았습니다.",
  points: [
    { title: "크기를 골라 담았어요", body: "한 상자 안에서 맛이 고릅니다." },
    { title: "껍질이 얇아요", body: "손으로 쉽게 까집니다." },
    { title: "양을 고를 수 있어요", body: "식구 수에 맞게 고르세요." },
  ],
  care: { title: "이렇게 보관하세요", body: "서늘한 곳에 두세요." },
  info: [
    { label: "원산지", value: "국내산 (제주)" },
    { label: "구성", value: "감귤 한 상자" },
    { label: "보관 방법", value: "서늘한 곳에 보관" },
    { label: "알아 두세요", value: "크기와 색이 조금씩 다를 수 있습니다." },
  ],
};

function variant(id: number, optionLabel: string, price: number, stockStatus: "in_stock" | "sold_out") {
  return { id, optionLabel, price, stockStatus, imageUrl: `/images/products/tangerine-${id}.webp`, note: `${optionLabel} 한 줄` };
}

function detailOf(id: number): ProductDetailResponse {
  const base = PRODUCTS.find((item) => item.id === id);
  if (base === undefined) throw new Error(`없는 상품: ${id}`);
  return {
    product: {
      ...base,
      description: "손으로 까서 바로 먹는, 새콤달콤한 제주 감귤",
      story: STORY,
      variants: [variant(1, "3kg", 17_900, "in_stock"), variant(2, "5kg", 27_900, "in_stock"), variant(3, "10kg", 49_900, "sold_out")],
    },
  };
}

function open(id: number) {
  for (const productId of [1, 2, 3]) api.on(`GET /api/products/${productId}`, () => ({ json: detailOf(productId) }));
  api.on("GET /api/shipping-policy", () => ({ json: { fee: 4_000, freeThreshold: 50_000 } }));
  return renderApp(`/products/${id}`);
}

describe("상품 상세 위쪽", () => {
  it("한 줄 소개와 옵션 버튼(이름·가격, 품절 표시)을 보이고 누르면 그 옵션 상품으로 간다", async () => {
    const router = open(1);
    expect(await screen.findByText("손으로 까서 바로 먹는, 새콤달콤한 제주 감귤")).toBeInTheDocument();

    const options = screen.getByRole("list", { name: "옵션" });
    expect(within(options).getAllByRole("link").map((link) => link.textContent)).toEqual(["3kg17,900원", "5kg27,900원", "10kg49,900원품절"]);
    expect(within(options).getByRole("link", { name: /^3kg/ })).toHaveAttribute("aria-current", "true");

    await userEvent.click(within(options).getByRole("link", { name: /^5kg/ }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/products/2");
    });
  });

  it("옵션 사진 줄의 사진은 그 옵션 상품으로 가는 링크다", async () => {
    const router = open(1);
    const photos = await screen.findByRole("list", { name: "옵션 사진" });

    expect(within(photos).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/products/1", "/products/2", "/products/3"]);
    await userEvent.click(within(photos).getByRole("link", { name: "10kg 옵션 보기" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/products/3");
    });
  });
});

describe("상품 상세 탭", () => {
  it("탭은 상품설명, 상품정보, 배송 안내, 교환·반품 안내 네 개이고 후기 탭은 없다", async () => {
    open(1);
    const tabs = within(await screen.findByRole("tablist", { name: "상품 안내" })).getAllByRole("tab");

    expect(tabs.map((tab) => tab.textContent)).toEqual(["상품설명", "상품정보", "배송 안내", "교환·반품 안내"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText(/후기|별점/)).not.toBeInTheDocument();
  });

  it("상품설명은 제목·소개·포인트 3개·보관 방법·옵션별 한 줄을 보인다", async () => {
    open(1);
    const panel = await screen.findByRole("tabpanel");

    expect(within(panel).getByRole("heading", { name: /겨울 내내 손이 가는\s+제주 감귤 한 상자/ })).toBeInTheDocument();
    expect(within(panel).getAllByText(/^POINT \d$/)).toHaveLength(3);
    expect(within(panel).getByRole("heading", { name: "이렇게 보관하세요" })).toBeInTheDocument();
    expect(within(panel).getByText("5kg 한 줄")).toBeInTheDocument();
  });

  it("상품정보 표는 상품명 줄 아래에 글의 4줄이 이어진다", async () => {
    open(1);
    await userEvent.click(await screen.findByRole("tab", { name: "상품정보" }));
    const rows = within(screen.getByRole("tabpanel")).getAllByRole("row");

    expect(rows.map((row) => row.textContent)).toEqual([
      "상품명제주 감귤 3kg",
      "원산지국내산 (제주)",
      "구성감귤 한 상자",
      "보관 방법서늘한 곳에 보관",
      "알아 두세요크기와 색이 조금씩 다를 수 있습니다.",
    ]);
  });

  it("배송 안내의 배송비 숫자는 서버가 준 규칙 값에서 온다", async () => {
    open(1);
    await userEvent.click(await screen.findByRole("tab", { name: "배송 안내" }));

    expect(await screen.findByText("50,000원 이상 주문하면 무료, 그 밖에는 4,000원")).toBeInTheDocument();
  });

  it("교환·반품 안내 글의 고객센터를 누르면 고객센터 화면으로 간다", async () => {
    const router = open(1);
    await userEvent.click(await screen.findByRole("tab", { name: "교환·반품 안내" }));
    const panel = screen.getByRole("tabpanel");

    expect(within(panel).getAllByRole("row").map((row) => row.textContent)).toEqual([
      "신청 기간받은 날부터 7일 안에 고객센터로 알려 주세요",
      "안 되는 경우신선식품은 단순 변심으로 교환·반품할 수 없어요",
    ]);
    await userEvent.click(within(panel).getByRole("link", { name: "고객센터" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/help");
    });
    expect(await screen.findByRole("heading", { level: 1, name: "고객센터" })).toBeInTheDocument();
  });
});
