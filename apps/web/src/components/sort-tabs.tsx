import type { ProductSort } from "@grabmarket/contracts";
import { useSearchParams } from "react-router";

export const SORT_LABELS: Record<ProductSort, string> = {
  default: "기본",
  price_asc: "낮은 가격",
  price_desc: "높은 가격",
};
const SORTS = Object.keys(SORT_LABELS) as ProductSort[];

export function useSort(): [ProductSort, (sort: ProductSort) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("sort");
  const current = SORTS.find((sort) => sort === raw) ?? "default";
  function change(sort: ProductSort) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (sort === "default") next.delete("sort");
        else next.set("sort", sort);
        return next;
      },
      { replace: true },
    );
  }
  return [current, change];
}

/** 정렬 3종. 데스크톱은 글자 탭, 모바일은 드롭다운. */
export function SortTabs() {
  const [current, change] = useSort();
  return (
    <>
      <div role="group" aria-label="정렬" className="hidden gap-5 md:flex">
        {SORTS.map((sort) => (
          <button
            key={sort}
            type="button"
            aria-pressed={sort === current}
            onClick={() => {
              change(sort);
            }}
            className={`relative pb-2.5 text-sm leading-5 ${sort === current ? "font-extrabold text-ink" : "font-semibold text-ink-3"}`}
          >
            {SORT_LABELS[sort]}
            {sort === current && <span aria-hidden="true" className="absolute inset-x-0 -bottom-px h-0.75 bg-accent" />}
          </button>
        ))}
      </div>
      <select
        aria-label="정렬"
        value={current}
        onChange={(event) => {
          change(event.target.value as ProductSort);
        }}
        className="h-10 rounded-md border border-line bg-ground px-3 text-sm font-semibold text-ink md:hidden"
      >
        {SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {SORT_LABELS[sort]}
          </option>
        ))}
      </select>
    </>
  );
}
