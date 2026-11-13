import { ProductSearchQuerySchema, type ProductSearchInput, type ProductSearchQuery } from "@grabmarket/contracts";

export interface ParsedSearch {
  /** 계약 스키마로 검사한 값 */
  query: ProductSearchQuery;
  /** API에 보낼 입력 */
  input: ProductSearchInput;
}

/** 주소의 검색 조건을 계약 스키마로 검사한다. 모양이 틀리면 null(화면은 찾을 수 없음으로 다룬다). */
export function parseSearchParams(params: URLSearchParams): ParsedSearch | null {
  const parsed = ProductSearchQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) return null;
  const query = parsed.data;
  return {
    query,
    input: {
      q: query.q,
      category: query.category,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      excludeSoldOut: query.excludeSoldOut ? "true" : undefined,
      sort: query.sort,
    },
  };
}

/** 카테고리·가격·품절 제외 중 하나라도 걸려 있는가(검색어와 정렬은 필터가 아니다) */
export function hasFilters(query: ProductSearchQuery): boolean {
  return query.category !== undefined || query.minPrice !== undefined || query.maxPrice !== undefined || query.excludeSoldOut;
}

export interface PriceBucket {
  label: string;
  min: number;
  max?: number;
}

/** 가격 구간(원). min 이상 max 이하. */
export const PRICE_BUCKETS: readonly PriceBucket[] = [
  { label: "1만원 미만", min: 0, max: 9_999 },
  { label: "1만원~2만원", min: 10_000, max: 19_999 },
  { label: "2만원~3만원", min: 20_000, max: 29_999 },
  { label: "3만원 이상", min: 30_000 },
];

/** 현재 가격 조건 안에 통째로 들어가는 구간 번호들 */
export function checkedBuckets(query: Pick<ProductSearchQuery, "minPrice" | "maxPrice">): number[] {
  const low = query.minPrice ?? 0;
  const high = query.maxPrice ?? Number.POSITIVE_INFINITY;
  const checked: number[] = [];
  PRICE_BUCKETS.forEach((bucket, index) => {
    if (bucket.min >= low && (bucket.max ?? Number.POSITIVE_INFINITY) <= high) checked.push(index);
  });
  return checked;
}

/**
 * 구간 하나를 켜거나 끈 뒤의 가격 조건. API는 가격 구간을 하나만 받으므로 이어진 구간만 합치고,
 * 떨어진 구간을 켜면 그 구간 하나로 바꾼다. 모두 끄면 가격 조건이 없다.
 */
export function toggleBucket(query: Pick<ProductSearchQuery, "minPrice" | "maxPrice">, index: number): { minPrice?: number; maxPrice?: number } {
  const current = new Set(checkedBuckets(query));
  if (current.has(index)) current.delete(index);
  else if (current.size === 0 || current.has(index - 1) || current.has(index + 1)) current.add(index);
  else {
    current.clear();
    current.add(index);
  }
  if (current.size === 0) return {};
  const sorted = [...current].sort((a, b) => a - b);
  const first = PRICE_BUCKETS[sorted[0] ?? 0];
  const last = PRICE_BUCKETS[sorted[sorted.length - 1] ?? 0];
  if (first === undefined || last === undefined) return {};
  const result: { minPrice?: number; maxPrice?: number } = {};
  if (first.min > 0) result.minPrice = first.min;
  if (last.max !== undefined) result.maxPrice = last.max;
  return result;
}
