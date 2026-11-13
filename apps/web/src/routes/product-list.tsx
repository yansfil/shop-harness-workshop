import type { ReactNode } from "react";
import { SortTabs } from "../components/sort-tabs.tsx";

/** 상품 목록 머리: 제목, 개수, (정렬을 보이면) 정렬 탭. */
export function ProductListHeading({ title, count, sortable = false }: { title: string; count?: number; sortable?: boolean }) {
  return (
    <div className="mb-4 flex items-end justify-between border-b border-line md:mb-4">
      <h1 className="flex items-baseline gap-2 pb-2.5 text-xl leading-8 font-extrabold text-ink">
        {title}
        {count !== undefined && <span className="text-sm leading-5 font-medium text-ink-3">{count}개</span>}
      </h1>
      {sortable && <SortTabs />}
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-xl leading-8 font-extrabold text-ink md:text-xl">{children}</h1>;
}
