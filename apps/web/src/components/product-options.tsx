import type { ProductDetail } from "@grabmarket/contracts";
import { Link } from "react-router";
import { groupDigits } from "../lib/format.ts";

type Variant = ProductDetail["variants"][number];

/** 옵션 이름이 없는 상품(옵션이 하나뿐인 경우)을 위한 글자 */
function optionName(variant: Variant): string {
  return variant.optionLabel ?? "기본";
}

/** 옵션 사진 줄. 한 상품의 사진을 넘겨 보는 곳이 아니라, 누르면 그 옵션 상품으로 가는 링크다. */
export function OptionPhotoRow({ variants, currentId }: { variants: Variant[]; currentId: number }) {
  return (
    <ul aria-label="옵션 사진" className="flex gap-2 overflow-x-auto p-1 max-md:px-4">
      {variants.map((variant) => {
        const current = variant.id === currentId;
        return (
          <li key={variant.id} className="shrink-0">
            <Link
              to={`/products/${variant.id}`}
              aria-label={`${optionName(variant)} 옵션 보기`}
              aria-current={current ? "true" : undefined}
              className={`block size-16 overflow-hidden rounded-sm bg-canvas md:size-18 ${current ? "outline-2 outline-ink" : "outline-1 outline-line"} focus-visible:outline-2 focus-visible:outline-ink`}
            >
              <img src={variant.imageUrl} alt="" className={`size-full object-cover ${variant.stockStatus === "sold_out" ? "opacity-45" : ""}`} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** 옵션 버튼. 이름·가격과 품절 표시를 보이고, 누르면 그 옵션 상품으로 간다. */
export function OptionChips({ variants, currentId }: { variants: Variant[]; currentId: number }) {
  return (
    <ul aria-label="옵션" className="flex gap-2 overflow-x-auto p-0.5 max-md:-mx-4 max-md:px-4 md:grid md:grid-cols-2 md:overflow-visible">
      {variants.map((variant) => {
        const current = variant.id === currentId;
        const soldOut = variant.stockStatus === "sold_out";
        return (
          <li key={variant.id} className="max-md:shrink-0">
            <Link
              to={`/products/${variant.id}`}
              aria-current={current ? "true" : undefined}
              className={`flex h-full min-h-14 items-center justify-between gap-3 rounded-md bg-ground px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                current ? "border-2 border-ink px-2.75" : "border border-line"
              }`}
            >
              <span className="flex flex-col gap-0.5 md:flex-1 md:flex-row md:items-center md:justify-between md:gap-3">
                <span className={`font-bold ${soldOut ? "text-ink-3" : "text-ink"}`}>{optionName(variant)}</span>
                <span className="text-xs-plus text-ink-3">{groupDigits(variant.price)}원</span>
              </span>
              {soldOut && <span className="rounded-sm bg-soldout-bg px-1.5 py-0.5 text-xs font-bold text-soldout-text">품절</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
