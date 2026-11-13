import { CategoryListResponseSchema, ProductDetailResponseSchema, ProductSearchResponseSchema, ProductSuggestResponseSchema, ROUTES, buildPath } from "@grabmarket/contracts";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestApp, PRODUCT } from "./support/test-app.ts";

async function search(query: Record<string, string>) {
  const { app } = createTestApp();
  return ProductSearchResponseSchema.parse((await request(app).get(ROUTES.products).query(query).expect(200)).body);
}

describe("상품 검색", () => {
  it("이름 부분 일치와 총 개수, 카테고리별 개수를 준다", async () => {
    const result = await search({ q: "감귤" });
    expect(result.products.map((product) => product.id)).toEqual([PRODUCT.tangerine]);
    expect(result.total).toBe(1);
    expect(result.categoryCounts.map((count) => [count.slug, count.count])).toEqual([["food", 1], ["living", 0], ["electronics", 0], ["fashion", 0]]);
  });

  it("카테고리 칩은 자기 조건만 빼고 센다", async () => {
    const result = await search({ category: "electronics" });
    expect(result.products.map((product) => product.id)).toEqual([PRODUCT.charger]);
    expect(result.categoryCounts.map((count) => count.count)).toEqual([2, 0, 1, 1]);
  });

  it("가격 구간, 품절 제외, 정렬이 함께 적용되고 페이지 나누기가 없다", async () => {
    expect((await search({ minPrice: "10000", maxPrice: "16000" })).products.map((product) => product.id)).toEqual([PRODUCT.rice, PRODUCT.charger]);
    expect((await search({ excludeSoldOut: "true" })).products.map((product) => product.id)).not.toContain(PRODUCT.rice);
    expect((await search({ sort: "price_desc" })).products.map((product) => product.price)).toEqual([17_900, 15_900, 14_900, 5_000]);
    expect((await search({ sort: "price_asc" })).products.map((product) => product.price)).toEqual([5_000, 14_900, 15_900, 17_900]);
  });

  it("재고 표시는 품절과 남은 수량 적음(5개 이하)을 서버가 계산한다", async () => {
    const result = await search({});
    const status = Object.fromEntries(result.products.map((product) => [product.id, product.stockStatus]));
    expect(status).toEqual({ [PRODUCT.tangerine]: "in_stock", [PRODUCT.charger]: "low", [PRODUCT.rice]: "sold_out", [PRODUCT.socks]: "in_stock" });
  });

  it("%나 _ 같은 글자는 와일드카드가 아니라 글자로 찾는다", async () => {
    expect((await search({ q: "%" })).products).toEqual([]);
  });

  it("자동완성은 일치 상품과 카테고리 제안을 주고, 상세는 같은 기본 상품의 변형을 준다", async () => {
    const { app } = createTestApp();
    const suggest = ProductSuggestResponseSchema.parse((await request(app).get(ROUTES.productSuggest).query({ q: "충전" }).expect(200)).body);
    expect(suggest).toEqual({ category: { slug: "electronics", name: "가전" }, products: [{ id: PRODUCT.charger, name: "USB-C 고속 충전기 35W" }] });
    expect(ProductSuggestResponseSchema.parse((await request(app).get(ROUTES.productSuggest).query({ q: "식" }).expect(200)).body).category).toEqual({ slug: "food", name: "식품" });

    const detail = ProductDetailResponseSchema.parse((await request(app).get(buildPath(ROUTES.product, { productId: PRODUCT.tangerine })).expect(200)).body);
    expect(detail.product.variants).toEqual([{ id: PRODUCT.tangerine, optionLabel: "3kg", price: 17_900, stockStatus: "in_stock" }]);
    await request(app).get(buildPath(ROUTES.product, { productId: 999 })).expect(404);
    expect(CategoryListResponseSchema.parse((await request(app).get(ROUTES.categories).expect(200)).body).categories.map((category) => category.productCount)).toEqual([2, 0, 1, 1]);
  });
});
