import type { Category, CategorySlug } from "./product.ts";

/** 입력이 카테고리 이름의 앞부분이거나, 일치 상품이 모두 한 카테고리에 있으면 그 카테고리를 제안한다. */
export function suggestCategory(q: string, categories: Category[], matchedSlugs: CategorySlug[]): Category | null {
  const byName = categories.find((category) => category.name.startsWith(q));
  if (byName !== undefined) return byName;
  const [only, ...rest] = matchedSlugs;
  if (only === undefined || rest.length > 0) return null;
  return categories.find((category) => category.slug === only) ?? null;
}
