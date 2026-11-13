import {
  type CategoryListResponse,
  LOW_STOCK_THRESHOLD,
  type ProductDetailResponse,
  type ProductSearchResponse,
  type ProductSuggestResponse,
  type ProductSummary,
  type StockStatus,
} from "@grabmarket/contracts";
import type { ProductDetail, SearchResult, SuggestResult } from "../application/catalog-service.ts";
import type { Category, Product } from "../domain/product.ts";

/** 고객 화면의 재고 표시. 5개 이하면 "남은 수량 적음". 관리자 안전재고와는 다르다. */
export function toStockStatus(quantity: number): StockStatus {
  if (quantity === 0) return "sold_out";
  return quantity <= LOW_STOCK_THRESHOLD ? "low" : "in_stock";
}

export function toProductSummaryDto(product: Product): ProductSummary {
  return {
    id: product.id,
    name: product.name,
    optionLabel: product.optionLabel,
    category: product.category,
    price: product.price,
    imageUrl: product.imagePath,
    stockQuantity: product.stockQuantity,
    stockStatus: toStockStatus(product.stockQuantity),
  };
}

export function toCategoryListDto(categories: Category[]): CategoryListResponse {
  return { categories: categories.map(({ id, slug, name, productCount }) => ({ id, slug, name, productCount })) };
}

export function toSearchDto(result: SearchResult): ProductSearchResponse {
  return {
    total: result.products.length,
    products: result.products.map(toProductSummaryDto),
    categoryCounts: result.categoryCounts,
  };
}

export function toSuggestDto(result: SuggestResult): ProductSuggestResponse {
  return {
    category: result.category === null ? null : { slug: result.category.slug, name: result.category.name },
    products: result.products,
  };
}

export function toProductDetailDto({ product, variants }: ProductDetail): ProductDetailResponse {
  return {
    product: {
      ...toProductSummaryDto(product),
      description: product.description,
      variants: variants.map((variant) => ({
        id: variant.id,
        optionLabel: variant.optionLabel,
        price: variant.price,
        stockStatus: toStockStatus(variant.stockQuantity),
      })),
    },
  };
}
