import type { ProductSearchResponse } from "@grabmarket/contracts";
import { useState } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData, useSearchParams } from "react-router";
import { callApi } from "../api/client.ts";
import { Button, LinkButton } from "../components/button.tsx";
import { Checkbox } from "../components/checkbox.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { ProductGrid, ProductGridSkeleton } from "../components/product-card.tsx";
import { SortTabs } from "../components/sort-tabs.tsx";
import { EmptyState } from "../components/states.tsx";
import { NotFoundError } from "../lib/not-found.ts";
import { checkedBuckets, hasFilters, parseSearchParams, PRICE_BUCKETS, toggleBucket } from "../lib/search-params.ts";
import { useRootData } from "../state/root-data.ts";

export function searchLoader({ request }: LoaderFunctionArgs) {
  const parsed = parseSearchParams(new URL(request.url).searchParams);
  if (parsed === null) throw new NotFoundError("검색 조건이 올바르지 않습니다");
  return { q: parsed.query.q ?? "", result: callApi("searchProducts", { query: parsed.input }) };
}

export function SearchPage() {
  const { q, result } = useLoaderData<typeof searchLoader>();
  const [params] = useSearchParams();
  const parsed = parseSearchParams(params);
  const filtered = parsed !== null && hasFilters(parsed.query);
  const title = q === "" ? "전체 상품" : `'${q}' 검색 결과`;

  return (
    <Page>
      <h1 className="text-3xl leading-9 font-extrabold text-ink max-md:sr-only">{title}</h1>
      <Loaded
        resolve={result}
        failure="검색 결과를 불러오지 못했어요"
        skeleton={
          <div className="mt-6">
            <ProductGridSkeleton columns="four" />
          </div>
        }
      >
        {(data: ProductSearchResponse) =>
          data.total === 0 && !filtered ? <NoResults q={q} /> : <Results q={q} data={data} filtered={filtered} />
        }
      </Loaded>
    </Page>
  );
}

function Results({ q, data, filtered }: { q: string; data: ProductSearchResponse; filtered: boolean }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [params, setParams] = useSearchParams();

  function clearFilters() {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const key of ["category", "minPrice", "maxPrice", "excludeSoldOut"]) next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <>
      <div className="mt-3 flex items-center justify-between border-b border-line md:mt-4">
        <p className="pb-2.5 text-sm leading-5 font-semibold text-ink max-md:py-2.5">총 {data.total}개</p>
        <div className="flex items-center gap-2 max-md:pb-2.5">
          <SortTabs />
          <button
            type="button"
            onClick={() => {
              setSheetOpen(true);
            }}
            className="flex h-10 items-center gap-1.5 rounded-md border-2 border-ink bg-ground px-3 text-sm font-bold text-ink md:hidden"
          >
            <Icon name="tune" className="size-5" />
            필터
          </button>
        </div>
      </div>
      <div className="mt-6 md:grid md:grid-cols-[16rem_minmax(0,1fr)] md:gap-8">
        <aside aria-label="필터" className="hidden md:block">
          <FilterPanel data={data} />
        </aside>
        <section aria-label="검색 결과">
          {data.total === 0 ? (
            <EmptyState
              title={q === "" ? "조건에 맞는 상품이 없어요" : `'${q}'에 조건이 맞는 상품이 없어요`}
              hint="필터를 풀면 다른 상품을 볼 수 있어요"
            >
              <Button onClick={clearFilters}>필터 풀기</Button>
            </EmptyState>
          ) : (
            <ProductGrid products={data.products} columns="four" />
          )}
        </section>
      </div>
      {sheetOpen && (
        <FilterSheet
          total={data.total}
          onClose={() => {
            setSheetOpen(false);
          }}
          onReset={filtered || params.has("minPrice") ? clearFilters : undefined}
        >
          <FilterPanel data={data} />
        </FilterSheet>
      )}
    </>
  );
}

/** 카테고리 칩(개수), 가격 구간, 품절 제외. 고르면 주소의 조건이 바뀌고 결과와 개수가 바로 바뀐다. */
function FilterPanel({ data }: { data: ProductSearchResponse }) {
  const [params, setParams] = useSearchParams();
  const parsed = parseSearchParams(params);
  if (parsed === null) return null;
  const { query } = parsed;
  const allCount = data.categoryCounts.reduce((sum, item) => sum + item.count, 0);
  const checked = checkedBuckets(query);

  function update(change: (next: URLSearchParams) => void) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        change(next);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="filter-category">
        <h2 id="filter-category" className="text-sm font-bold text-ink">
          카테고리
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          <li>
            <CategoryChip
              label="전체"
              count={allCount}
              selected={query.category === undefined}
              onClick={() => {
                update((next) => {
                  next.delete("category");
                });
              }}
            />
          </li>
          {data.categoryCounts.map((item) => (
            <li key={item.slug}>
              <CategoryChip
                label={item.name}
                count={item.count}
                selected={query.category === item.slug}
                disabled={item.count === 0 && query.category !== item.slug}
                onClick={() => {
                  update((next) => {
                    next.set("category", item.slug);
                  });
                }}
              />
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="filter-price">
        <h2 id="filter-price" className="text-sm font-bold text-ink">
          가격
        </h2>
        <ul className="mt-2">
          {PRICE_BUCKETS.map((bucket, index) => {
            const isChecked = checked.includes(index);
            return (
              <li key={bucket.label} className="h-10">
                <Checkbox
                  checked={isChecked}
                  label={bucket.label}
                  visibleLabel
                  onChange={() => {
                    const range = toggleBucket(query, index);
                    update((next) => {
                      next.delete("minPrice");
                      next.delete("maxPrice");
                      if (range.minPrice !== undefined) next.set("minPrice", String(range.minPrice));
                      if (range.maxPrice !== undefined) next.set("maxPrice", String(range.maxPrice));
                    });
                  }}
                />
              </li>
            );
          })}
        </ul>
      </section>
      <section className="flex items-center justify-between">
        <h2 id="filter-soldout" className="text-sm font-bold text-ink">
          품절 제외
        </h2>
        <button
          type="button"
          role="switch"
          aria-checked={query.excludeSoldOut}
          aria-labelledby="filter-soldout"
          onClick={() => {
            update((next) => {
              if (query.excludeSoldOut) next.delete("excludeSoldOut");
              else next.set("excludeSoldOut", "true");
            });
          }}
          className={`relative h-6 w-11 rounded-pill ${query.excludeSoldOut ? "bg-ink" : "bg-layer-edge"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-pill bg-ground ${query.excludeSoldOut ? "left-5.5" : "left-0.5"}`} />
        </button>
      </section>
    </div>
  );
}

function CategoryChip({
  label,
  count,
  selected,
  disabled = false,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tone = selected
    ? "border-ink bg-ink text-on-dark"
    : disabled
      ? "border-dashed border-layer-edge bg-ground text-ink-3"
      : "border-line bg-ground text-ink";
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 items-center gap-1.5 rounded-sm border px-3 text-sm ${tone}`}
    >
      <span className="font-bold">{label}</span>
      <span className="font-normal">{count}</span>
    </button>
  );
}

function FilterSheet({
  total,
  onClose,
  onReset,
  children,
}: {
  total: number;
  onClose: () => void;
  onReset: (() => void) | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="필터">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-md bg-ground">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 className="text-base font-extrabold text-ink">필터</h2>
          <button type="button" aria-label="필터 닫기" onClick={onClose} className="flex size-8 items-center justify-center">
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        <div className="flex shrink-0 gap-2 border-t border-line p-4">
          <Button variant="secondary" size="lg" disabled={onReset === undefined} onClick={onReset}>
            초기화
          </Button>
          <Button size="lg" className="flex-1" onClick={onClose}>
            {total}개 상품 보기
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 검색어에 맞는 상품이 하나도 없을 때(S5). 다른 상품으로 채우지 않고 다음에 할 일을 준다. */
function NoResults({ q }: { q: string }) {
  const { categories } = useRootData();
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center">
      <h2 className="text-3xl leading-9 font-extrabold text-ink">{q === "" ? "상품이 없어요" : `'${q}'에 맞는 상품이 없어요`}</h2>
      <p className="mt-3 text-base text-ink-2">철자를 확인하거나 더 짧은 말로 찾아보세요</p>
      <ul className="mt-8 flex flex-col gap-3 text-left text-sm">
        <li className="flex gap-3">
          <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 bg-ink" />
          <span>
            <b className="font-bold text-ink">띄어쓰기를 바꿔 보세요</b>
            <br />
            <span className="text-ink-2">감귤 3kg → 감귤3kg</span>
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 bg-ink" />
          <span>
            <b className="font-bold text-ink">더 짧은 말로 찾아보세요</b>
            <br />
            <span className="text-ink-2">제주 감귤 3kg → 감귤</span>
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 bg-ink" />
          <b className="font-bold text-ink">상품 이름의 일부만 쳐도 찾아요</b>
        </li>
      </ul>
      <p className="mt-10 text-sm font-bold text-ink-2">카테고리로 찾아보기</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-2">
        {categories.map((category) => (
          <li key={category.slug}>
            <Link
              to={`/category/${category.slug}`}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-ink bg-ground px-4 text-sm font-bold text-ink"
            >
              {category.name}
              <span className="font-normal text-ink-3">{category.productCount}</span>
            </Link>
          </li>
        ))}
      </ul>
      <LinkButton to="/" size="lg" className="mt-8 min-w-60">
        전체 상품 보기
      </LinkButton>
    </div>
  );
}
