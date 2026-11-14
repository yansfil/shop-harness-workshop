import { type ApiErrorResponse, buildPath, EventDetailResponseSchema, EventListResponseSchema, ROUTES } from "@grabmarket/contracts";
import { createTestDatabase, type Database } from "@grabmarket/db";
import { FixedClock } from "@grabmarket/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { composeApp } from "../apps/api/src/composition.ts";
import { SEED_CATEGORIES, SEED_PRODUCTS } from "../apps/api/src/seed/product-catalog.ts";
import { NOW } from "./support/test-app.ts";

/** 기획전이 가리키는 상품이 모두 있도록 시드 상품 120개를 그대로 넣는다. */
function createCatalogApp() {
  const db: Database = createTestDatabase();
  for (const [index, category] of SEED_CATEGORIES.entries()) {
    db.prepare("INSERT INTO categories (slug, name, sort_order) VALUES (?, ?, ?)").run(category.slug, category.name, index + 1);
  }
  for (const base of SEED_PRODUCTS) {
    const categoryId = (db.prepare("SELECT id FROM categories WHERE slug = ?").get(base.category) as { id: number }).id;
    for (const [index, [option, price]] of base.variants.entries()) {
      const result = db
        .prepare("INSERT INTO products (category_id, base_key, name, option_label, description, price, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(categoryId, base.key, `${base.name} ${option}`, option, base.name, price, `/images/products/${base.key}-${index + 1}.webp`, NOW);
      db.prepare("INSERT INTO inventory (product_id, quantity, safety_stock, updated_at) VALUES (?, ?, ?, ?)").run(Number(result.lastInsertRowid), 20, 5, NOW);
    }
  }
  return composeApp({ db, clock: new FixedClock(NOW) });
}

describe("기획전 목록", () => {
  it("기획전 4개를 보여 줄 순서대로, 기간 글자와 배너 경로와 상품 수까지 준다", async () => {
    const result = EventListResponseSchema.parse((await request(createCatalogApp()).get(ROUTES.events).expect(200)).body);
    expect(result.events).toEqual([
      { slug: "winter-ready", title: "겨울 채비, 따뜻하게", summary: "찬 바람 불기 전에 입고 두를 것부터 챙겨요.", period: "11월 14일 ~ 11월 30일", bannerUrl: "/images/events/banner-winter-ready.webp", productCount: 8 },
      { slug: "tangerine-season", title: "제철 감귤 모음", summary: "상자째 받는 감귤부터 주스·젤리까지 모았어요.", period: "11월 10일 ~ 12월 7일", bannerUrl: "/images/events/banner-tangerine-season.webp", productCount: 8 },
      { slug: "tidy-home", title: "집 정리 한 번에", summary: "수납 바구니와 세제, 수건까지 한곳에서 골라요.", period: "11월 12일 ~ 12월 14일", bannerUrl: "/images/events/banner-tidy-home.webp", productCount: 8 },
      { slug: "desk-gadgets", title: "책상 위 작은 가전", summary: "오래 앉는 자리를 편하게 해 줄 가전을 골랐어요.", period: "11월 14일 ~ 12월 20일", bannerUrl: "/images/events/banner-desk-gadgets.webp", productCount: 8 },
    ]);
  });
});

describe("기획전 상세", () => {
  it("기획전이 정한 순서대로 변형 상품을 상품 카드 모양으로 준다", async () => {
    const result = EventDetailResponseSchema.parse((await request(createCatalogApp()).get(buildPath(ROUTES.event, { slug: "tangerine-season" })).expect(200)).body);
    expect(result.event.title).toBe("제철 감귤 모음");
    expect(result.products.map((product) => [product.name, product.price, product.imageUrl])).toEqual([
      ["제주 감귤 3kg", 17_900, "/images/products/jeju-tangerine-2.webp"],
      ["제주 감귤 5kg", 27_900, "/images/products/jeju-tangerine-3.webp"],
      ["하우스 감귤 2kg", 18_900, "/images/products/house-tangerine-2.webp"],
      ["감귤 주스 1L", 7_900, "/images/products/tangerine-juice-2.webp"],
      ["감귤 젤리 24개입", 14_900, "/images/products/tangerine-jelly-2.webp"],
      ["말린 감귤칩 100g", 10_900, "/images/products/dried-tangerine-chips-2.webp"],
      ["감귤 식초 500ml", 8_900, "/images/products/tangerine-vinegar-1.webp"],
      ["제주 감귤 10kg", 49_900, "/images/products/jeju-tangerine-4.webp"],
    ]);
    expect(result.products.every((product) => product.stockStatus === "in_stock")).toBe(true);
  });

  it("없는 기획전은 404 NOT_FOUND다", async () => {
    const response = await request(createCatalogApp()).get(buildPath(ROUTES.event, { slug: "no-such-event" })).expect(404);
    expect((response.body as ApiErrorResponse).error.code).toBe("NOT_FOUND");
  });
});
