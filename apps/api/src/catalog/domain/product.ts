import type { Money } from "@grabmarket/shared";

export type CategorySlug = "food" | "living" | "electronics" | "fashion";

export interface Category {
  id: number;
  slug: CategorySlug;
  name: string;
  productCount: number;
}

export interface Product {
  id: number;
  baseKey: string;
  /** 변형을 포함한 표시 이름. 예: "제주 감귤 3kg" */
  name: string;
  optionLabel: string | null;
  description: string;
  category: { slug: CategorySlug; name: string };
  price: Money;
  imagePath: string;
  stockQuantity: number;
}

export interface ProductVariant {
  id: number;
  optionLabel: string | null;
  price: Money;
  stockQuantity: number;
}

export type ProductSort = "default" | "price_asc" | "price_desc";

export interface SearchCriteria {
  /** 이름 부분 일치. 비어 있으면 조건 없음 */
  q: string;
  category?: CategorySlug | undefined;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  excludeSoldOut: boolean;
  sort: ProductSort;
}

export interface CategoryCount {
  slug: CategorySlug;
  name: string;
  count: number;
}

export interface VariantRef {
  baseKey: string;
  optionLabel: string;
}

export interface SuggestMatches {
  /** 이름이 일치하는 상품 최대 limit개 */
  products: { id: number; name: string }[];
  /** 일치한 상품 전체가 속한 카테고리들 */
  categorySlugs: CategorySlug[];
}

export interface CatalogRepository {
  listCategories(): Category[];
  search(criteria: SearchCriteria): Product[];
  /** category 조건만 빼고 나머지 조건을 적용한 카테고리별 개수. 모든 카테고리가 sort_order 순서로 들어 있다 */
  countByCategory(criteria: SearchCriteria): CategoryCount[];
  suggest(q: string, limit: number): SuggestMatches;
  findById(id: number): Product | undefined;
  findByIds(ids: number[]): Product[];
  findVariants(baseKey: string): ProductVariant[];
  /** 기본 상품 key와 변형 이름으로 찾는다. 찾은 상품만 돌려주고 순서는 정하지 않는다 */
  findByVariants(refs: readonly VariantRef[]): Product[];
}
