import type { ProductSummary } from "@grabmarket/contracts";
import { Link } from "react-router";
import { deliveryLabel } from "../lib/delivery.ts";
import { groupDigits } from "../lib/format.ts";

type Tone = "ship" | "low" | "soldout";

const BADGE_TONES: Record<Tone, string> = {
  ship: "bg-accent text-ink",
  low: "bg-status-preparing-bg text-status-preparing-text",
  soldout: "bg-soldout-bg text-soldout-text",
};

/** 상품의 재고 상태에서 카드·장바구니가 쓰는 뱃지 하나를 고른다. */
export function stockBadge(product: Pick<ProductSummary, "stockStatus" | "category">): { label: string; tone: Tone } {
  if (product.stockStatus === "sold_out") return { label: "품절", tone: "soldout" };
  if (product.stockStatus === "low") return { label: "남은 수량 적음", tone: "low" };
  return { label: deliveryLabel(product.category.slug), tone: "ship" };
}

export function ProductBadge({ product, className = "" }: { product: Pick<ProductSummary, "stockStatus" | "category">; className?: string }) {
  const badge = stockBadge(product);
  return <span className={`inline-block rounded-sm px-1.5 py-0.5 text-xs font-bold ${BADGE_TONES[badge.tone]} ${className}`}>{badge.label}</span>;
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const soldOut = product.stockStatus === "sold_out";
  return (
    <Link
      to={`/products/${product.id}`}
      className="block overflow-hidden rounded-md border border-line bg-ground focus-visible:outline-2 focus-visible:outline-ink"
    >
      <div className="aspect-square bg-canvas">
        <img
          src={product.imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={`size-full object-cover ${soldOut ? "opacity-45" : ""}`}
        />
      </div>
      <div className="flex flex-col gap-1 p-3">
        <span className={`truncate text-sm leading-5 font-medium ${soldOut ? "text-ink-3" : "text-ink-2"}`}>{product.name}</span>
        <span className={`mt-0.5 flex items-baseline gap-0.5 ${soldOut ? "text-ink-3" : "text-ink"}`}>
          <span className="text-lg leading-7 font-extrabold tracking-tight">{groupDigits(product.price)}</span>
          <span className="text-sm font-semibold">원</span>
        </span>
        <ProductBadge product={product} className="mt-1 self-start" />
      </div>
    </Link>
  );
}

export function ProductGrid({ products, columns = "five" }: { products: ProductSummary[]; columns?: "five" | "four" }) {
  const cols = columns === "five" ? "md:grid-cols-4 lg:grid-cols-5" : "md:grid-cols-3 lg:grid-cols-4";
  return (
    <ul className={`grid grid-cols-2 gap-3 ${cols}`}>
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} />
        </li>
      ))}
    </ul>
  );
}

export function ProductGridSkeleton({ columns = "five", count = 10 }: { columns?: "five" | "four"; count?: number }) {
  const cols = columns === "five" ? "md:grid-cols-4 lg:grid-cols-5" : "md:grid-cols-3 lg:grid-cols-4";
  return (
    <ul aria-hidden="true" className={`grid grid-cols-2 gap-3 ${cols}`}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="overflow-hidden rounded-md border border-line bg-ground">
          <div className="aspect-square animate-pulse bg-line" />
          <div className="flex flex-col gap-2 p-3">
            <div className="h-4 w-3/4 animate-pulse rounded-sm bg-line" />
            <div className="h-6 w-1/2 animate-pulse rounded-sm bg-line" />
            <div className="h-5 w-1/3 animate-pulse rounded-sm bg-line" />
          </div>
        </li>
      ))}
    </ul>
  );
}
