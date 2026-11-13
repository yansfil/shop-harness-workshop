import { DomainError, notFound } from "../../shared/domain/domain-error.ts";
import type { Category, CategoryCount, CatalogRepository, Product, ProductVariant, SearchCriteria } from "../domain/product.ts";
import { suggestCategory } from "../domain/suggest.ts";

export interface SearchResult {
  products: Product[];
  categoryCounts: CategoryCount[];
}

export interface SuggestResult {
  category: Category | null;
  products: { id: number; name: string }[];
}

export interface ProductDetail {
  product: Product;
  variants: ProductVariant[];
}

export class CatalogService {
  readonly #catalog: CatalogRepository;

  constructor(catalog: CatalogRepository) {
    this.#catalog = catalog;
  }

  listCategories(): Category[] {
    return this.#catalog.listCategories();
  }

  search(criteria: SearchCriteria): SearchResult {
    return { products: this.#catalog.search(criteria), categoryCounts: this.#catalog.countByCategory(criteria) };
  }

  suggest(q: string, limit: number): SuggestResult {
    const matches = this.#catalog.suggest(q, limit);
    return { category: suggestCategory(q, this.#catalog.listCategories(), matches.categorySlugs), products: matches.products };
  }

  getProduct(id: number): ProductDetail {
    const product = this.#catalog.findById(id);
    if (product === undefined) throw notFound("상품");
    return { product, variants: this.#catalog.findVariants(product.baseKey) };
  }

  /** 주문이 쓰는 조회: 모든 상품이 있어야 한다. 요청 순서대로 돌려준다. */
  getProductsForOrder(ids: number[]): Product[] {
    const found = new Map(this.#catalog.findByIds(ids).map((product) => [product.id, product]));
    return ids.map((id) => {
      const product = found.get(id);
      if (product === undefined) throw new DomainError("NOT_FOUND", "주문할 수 없는 상품이 있습니다.");
      return product;
    });
  }
}
