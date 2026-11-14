import { z } from "zod";
import { IdSchema, MoneySchema } from "./common.ts";

export const CategorySlugSchema = z.enum(["food", "living", "electronics", "fashion"]);
export type CategorySlug = z.infer<typeof CategorySlugSchema>;

export const CategorySchema = z.object({
  id: IdSchema,
  slug: CategorySlugSchema,
  /** 식품·생활·가전·패션 */
  name: z.string(),
  productCount: z.number().int().nonnegative(),
});
export type Category = z.infer<typeof CategorySchema>;

/** GET /api/categories (로그인 불필요). sort_order 순서. */
export const CategoryListResponseSchema = z.object({ categories: z.array(CategorySchema) });
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

/** 고객 화면의 재고 표시. low는 "남은 수량 적음"(5개 이하, LOW_STOCK_THRESHOLD)이다. 관리자 안전재고와는 다르다. */
export const StockStatusSchema = z.enum(["in_stock", "low", "sold_out"]);
export type StockStatus = z.infer<typeof StockStatusSchema>;
export const LOW_STOCK_THRESHOLD = 5;

export const ProductSummarySchema = z.object({
  id: IdSchema,
  /** 변형을 포함한 표시 이름. 예: "제주 감귤 3kg" */
  name: z.string(),
  /** 변형 이름. 예: "3kg". 변형이 없으면 null */
  optionLabel: z.string().nullable(),
  category: z.object({ slug: CategorySlugSchema, name: z.string() }),
  price: MoneySchema,
  /** 예: /images/products/jeju-tangerine-2.webp (변형마다 다른 이미지, 번호는 변형 순서) */
  imageUrl: z.string(),
  stockQuantity: z.number().int().nonnegative(),
  stockStatus: StockStatusSchema,
});
export type ProductSummary = z.infer<typeof ProductSummarySchema>;

export const ProductSortSchema = z.enum([
  /** 기본: 카테고리 순서, 그 안에서 상품 id 순 */
  "default",
  "price_asc",
  "price_desc",
]);
export type ProductSort = z.infer<typeof ProductSortSchema>;

/**
 * GET /api/products 쿼리 (로그인 불필요). 모두 선택이고 조건은 AND로 묶인다.
 * 결과는 한 번에 모두 준다. 페이지 나누기·더보기는 없다.
 */
export const ProductSearchQuerySchema = z
  .object({
    /** 상품 이름 부분 일치(대소문자 무시). 앞뒤 공백은 지운다. 빈 문자열은 조건 없음 */
    q: z.string().trim().max(50).optional(),
    category: CategorySlugSchema.optional(),
    minPrice: z.coerce.number().int().nonnegative().optional(),
    maxPrice: z.coerce.number().int().nonnegative().optional(),
    /** "true"면 품절 상품을 뺀다 */
    excludeSoldOut: z.stringbool().default(false),
    sort: ProductSortSchema.default("default"),
  })
  .refine((query) => query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice, {
    message: "최저 가격이 최고 가격보다 클 수 없습니다",
    path: ["minPrice"],
  });
export type ProductSearchQuery = z.infer<typeof ProductSearchQuerySchema>;
/** 화면이 쿼리 문자열을 만들 때 쓰는 입력 모양 */
export type ProductSearchInput = z.input<typeof ProductSearchQuerySchema>;

export const ProductSearchResponseSchema = z.object({
  /** "총 N개" (products.length와 같다) */
  total: z.number().int().nonnegative(),
  products: z.array(ProductSummarySchema),
  /**
   * 필터 칩의 카테고리별 개수: category 조건만 빼고 나머지 조건(q·가격·품절 제외)을 적용한 개수.
   * 4개 카테고리가 sort_order 순서로 항상 모두 들어 있다(0개 포함).
   */
  categoryCounts: z.array(z.object({ slug: CategorySlugSchema, name: z.string(), count: z.number().int().nonnegative() })),
});
export type ProductSearchResponse = z.infer<typeof ProductSearchResponseSchema>;

/** GET /api/products/suggest?q= (로그인 불필요). 검색창 자동 완성 */
export const ProductSuggestQuerySchema = z.object({ q: z.string().trim().min(1).max(50) });
export type ProductSuggestQuery = z.infer<typeof ProductSuggestQuerySchema>;

export const SUGGEST_LIMIT = 8;

export const ProductSuggestResponseSchema = z.object({
  /** 입력이 카테고리 이름과 일치하거나 일치 상품이 한 카테고리에 몰리면 그 카테고리, 아니면 null */
  category: z.object({ slug: CategorySlugSchema, name: z.string() }).nullable(),
  /** 이름이 일치하는 상품 최대 SUGGEST_LIMIT개. 강조는 화면이 q로 한다 */
  products: z.array(z.object({ id: IdSchema, name: z.string() })).max(SUGGEST_LIMIT),
});
export type ProductSuggestResponse = z.infer<typeof ProductSuggestResponseSchema>;

export const ProductParamsSchema = z.object({ productId: z.coerce.number().int().positive() });

/** GET /api/products/:productId (로그인 불필요). 없으면 404 NOT_FOUND */
export const ProductDetailResponseSchema = z.object({
  product: ProductSummarySchema.extend({
    description: z.string(),
    /** 같은 기본 상품의 변형들(자기 자신 포함), 가격 오름차순 */
    variants: z.array(
      z.object({
        id: IdSchema,
        optionLabel: z.string().nullable(),
        price: MoneySchema,
        stockStatus: StockStatusSchema,
      }),
    ),
  }),
});
export type ProductDetailResponse = z.infer<typeof ProductDetailResponseSchema>;
export type ProductDetail = ProductDetailResponse["product"];
