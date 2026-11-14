import type { Category, EventDetailResponse, EventSummary, ProductSearchResponse, ProductSummary } from "@grabmarket/contracts";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * 테스트용 가짜 서버. 화면이 부르는 HTTP(fetch)만 대신한다(우리 코드는 가짜로 바꾸지 않는다).
 * 응답은 계약 모양이고, 검색은 서버 규칙(이름 부분 일치·카테고리·가격·품절 제외·정렬)을 작게 흉내 낸다.
 */

export const CATEGORIES: Category[] = [
  { id: 1, slug: "food", name: "식품", productCount: 4 },
  { id: 2, slug: "living", name: "생활", productCount: 1 },
  { id: 3, slug: "electronics", name: "가전", productCount: 1 },
  { id: 4, slug: "fashion", name: "패션", productCount: 0 },
];

function product(id: number, name: string, categorySlug: ProductSummary["category"]["slug"], price: number, stockQuantity: number): ProductSummary {
  const category = CATEGORIES.find((item) => item.slug === categorySlug);
  if (category === undefined) throw new Error(`없는 카테고리: ${categorySlug}`);
  return {
    id,
    name,
    optionLabel: null,
    category: { slug: category.slug, name: category.name },
    price,
    imageUrl: `/images/products/p${id}.webp`,
    stockQuantity,
    stockStatus: stockQuantity === 0 ? "sold_out" : stockQuantity <= 5 ? "low" : "in_stock",
  };
}

export const PRODUCTS: ProductSummary[] = [
  product(1, "제주 감귤 3kg", "food", 17_900, 40),
  product(2, "하우스 감귤 2kg", "food", 18_900, 4),
  product(3, "감귤 젤리 12개입", "food", 7_900, 0),
  product(4, "백미 4kg", "food", 15_900, 30),
  product(5, "호텔식 면 수건 5장", "living", 24_900, 0),
  product(6, "무선 블루투스 헤드폰 기본형", "electronics", 59_000, 12),
];

function eventSummary(slug: string, title: string, summary: string, period: string, productCount: number): EventSummary {
  return { slug, title, summary, period, bannerUrl: `/images/events/banner-${slug}.webp`, productCount };
}

export const EVENT_DETAILS: EventDetailResponse[] = [
  {
    event: eventSummary("winter-ready", "겨울 채비, 따뜻하게", "찬 바람 불기 전에 입고 두를 것부터 챙겨요.", "11월 14일 ~ 11월 30일", 2),
    products: [PRODUCTS[3], PRODUCTS[4]].filter((item) => item !== undefined),
  },
  {
    event: eventSummary("tangerine-season", "제철 감귤 모음", "상자째 받는 감귤부터 주스·젤리까지 모았어요.", "11월 10일 ~ 12월 7일", 3),
    products: [PRODUCTS[0], PRODUCTS[1], PRODUCTS[2]].filter((item) => item !== undefined),
  },
];

export function search(query: URLSearchParams): ProductSearchResponse {
  const q = query.get("q")?.toLowerCase();
  const minPrice = query.has("minPrice") ? Number(query.get("minPrice")) : undefined;
  const maxPrice = query.has("maxPrice") ? Number(query.get("maxPrice")) : undefined;
  const excludeSoldOut = query.get("excludeSoldOut") === "true";
  const base = PRODUCTS.filter(
    (item) =>
      (q === undefined || item.name.toLowerCase().includes(q)) &&
      (minPrice === undefined || item.price >= minPrice) &&
      (maxPrice === undefined || item.price <= maxPrice) &&
      (!excludeSoldOut || item.stockQuantity > 0),
  );
  const category = query.get("category");
  const products = base.filter((item) => category === null || item.category.slug === category);
  const sort = query.get("sort");
  if (sort === "price_asc") products.sort((a, b) => a.price - b.price);
  if (sort === "price_desc") products.sort((a, b) => b.price - a.price);
  return {
    total: products.length,
    products,
    categoryCounts: CATEGORIES.map((item) => ({ slug: item.slug, name: item.name, count: base.filter((candidate) => candidate.category.slug === item.slug).length })),
  };
}

type Reply = { status?: number; json?: unknown };
type Handler = (request: { url: URL; body: unknown }) => Reply;

const error = (status: number, code: string, message: string): Reply => ({ status, json: { error: { code, message } } });

function defaults(): Record<string, Handler> {
  return {
    "GET /api/auth/me": () => error(401, "UNAUTHENTICATED", "로그인이 필요해요."),
    "GET /api/categories": () => ({ json: { categories: CATEGORIES } }),
    "GET /api/events": () => ({ json: { events: EVENT_DETAILS.map((detail) => detail.event) } }),
    ...Object.fromEntries(EVENT_DETAILS.map((detail): [string, Handler] => [`GET /api/events/${detail.event.slug}`, () => ({ json: detail })])),
    "GET /api/products": ({ url }) => ({ json: search(url.searchParams) }),
    "GET /api/products/suggest": ({ url }) => {
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const hits = PRODUCTS.filter((item) => item.name.toLowerCase().includes(q));
      const slugs = new Set(hits.map((item) => item.category.slug));
      const only = slugs.size === 1 ? hits[0]?.category : undefined;
      return { json: { category: only ?? null, products: hits.slice(0, 8).map((item) => ({ id: item.id, name: item.name })) } };
    },
  };
}

export interface FakeApi {
  /** 이 테스트에서만 응답을 바꾼다. 키는 "GET /api/products" 꼴. */
  on: (route: string, handler: Handler) => void;
  /** 지금까지 받은 요청("GET /api/products?q=귤" 꼴) */
  requests: string[];
}

/** 각 테스트 전에 가짜 서버를 켜고 끝나면 되돌린다. */
export function installFakeApi(): FakeApi {
  const api: FakeApi = { on: () => undefined, requests: [] };

  beforeEach(() => {
    const handlers = defaults();
    api.requests = [];
    api.on = (route, handler) => {
      handlers[route] = handler;
    };
    vi.stubGlobal("fetch", (input: string, init?: RequestInit) => {
      const url = new URL(input, "http://localhost");
      const method = init?.method ?? "GET";
      api.requests.push(`${method} ${url.pathname}${url.search}`);
      const handler = handlers[`${method} ${url.pathname}`];
      const reply = handler === undefined ? error(404, "NOT_FOUND", "찾을 수 없어요") : handler({ url, body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined });
      return Promise.resolve(new Response(JSON.stringify(reply.json), { status: reply.status ?? 200, headers: { "Content-Type": "application/json" } }));
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  return api;
}
