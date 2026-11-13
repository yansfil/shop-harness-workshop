import type { Category } from "@grabmarket/contracts";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { splitByQuery } from "../lib/highlight.ts";
import { addRecentSearch, clearRecentSearches, removeRecentSearch, useRecentSearches } from "../state/recent-searches.ts";
import { useRootData } from "../state/root-data.ts";
import { Icon } from "./icon.tsx";
import { type SuggestState, useSuggestions } from "./use-suggestions.ts";

type Row =
  | { kind: "recent"; term: string }
  | { kind: "category"; slug: Category["slug"]; name: string }
  | { kind: "product"; id: number; name: string };

function searchUrl(q: string, category?: string): string {
  const params = new URLSearchParams({ q });
  if (category !== undefined) params.set("category", category);
  return `/search?${params.toString()}`;
}

/** 머리의 검색창. 누르면 최근 검색어(없으면 카테고리 칩)가, 치면 자동완성이 레이어(모바일은 전체 화면)로 뜬다. */
export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const { categories } = useRootData();
  const recents = useRecentSearches();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const trimmed = query.trim();
  const suggest = useSuggestions(trimmed);
  const rows = buildRows(trimmed, recents, suggest);

  function close() {
    setOpen(false);
    setActive(-1);
  }

  function submit(term: string, category?: string) {
    const q = term.trim();
    if (q === "") return;
    addRecentSearch(q);
    close();
    inputRef.current?.blur();
    void navigate(searchUrl(q, category));
  }

  function choose(row: Row) {
    if (row.kind === "recent") {
      setQuery(row.term);
      submit(row.term);
    } else if (row.kind === "category") {
      submit(trimmed, row.slug);
    } else {
      close();
      inputRef.current?.blur();
      void navigate(`/products/${row.id}`);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      close();
    } else if (event.key === "ArrowDown" && rows.length > 0) {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % rows.length);
    } else if (event.key === "ArrowUp" && rows.length > 0) {
      event.preventDefault();
      setActive((index) => (index <= 0 ? rows.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      const row = rows[active];
      if (row !== undefined) {
        event.preventDefault();
        choose(row);
      }
    }
  }

  return (
    <div className="relative w-full md:max-w-190 md:flex-1">
      {open && <div aria-hidden="true" onClick={close} className="fixed inset-0 -z-10 bg-scrim" />}
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          submit(query);
        }}
        className={`flex h-11 items-center overflow-hidden rounded-md border-2 border-ink bg-ground md:h-12 ${open ? "outline-3 outline-accent" : ""}`}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoComplete="off"
          enterKeyHint="search"
          aria-label="상품 검색"
          placeholder="찾으시는 상품을 검색해 보세요"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent px-3 text-base font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3 md:px-4"
        />
        {query !== "" && (
          <button
            type="button"
            aria-label="입력 지우기"
            onClick={() => {
              setQuery("");
              setActive(-1);
              inputRef.current?.focus();
            }}
            className="mr-3 flex size-5 items-center justify-center text-ink-3"
          >
            <Icon name="close" className="size-5" />
          </button>
        )}
        <button type="submit" aria-label="검색" className="flex h-full w-12 items-center justify-center bg-accent text-ink md:w-14">
          <Icon name="search" />
        </button>
      </form>
      {open && (
        <div className="fixed inset-x-0 bottom-0 overflow-y-auto border-t border-layer-edge bg-ground md:absolute md:inset-x-auto md:top-full md:bottom-auto md:left-0 md:mt-2 md:w-190 md:rounded-md md:border">
          {trimmed === "" ? (
            <RecentLayer recents={recents} categories={categories} rows={rows} active={active} onChoose={choose} onClose={close} />
          ) : (
            <SuggestLayer query={trimmed} suggest={suggest} rows={rows} active={active} onChoose={choose} />
          )}
        </div>
      )}
    </div>
  );
}

function buildRows(trimmed: string, recents: string[], suggest: SuggestState): Row[] {
  if (trimmed === "") return recents.map((term) => ({ kind: "recent", term }));
  if (suggest.status !== "ready") return [];
  const rows: Row[] = [];
  if (suggest.data.category !== null) rows.push({ kind: "category", ...suggest.data.category });
  for (const product of suggest.data.products) rows.push({ kind: "product", id: product.id, name: product.name });
  return rows;
}

const rowBase = "flex w-full items-center text-left text-base text-ink";

function RecentLayer({
  recents,
  categories,
  rows,
  active,
  onChoose,
  onClose,
}: {
  recents: string[];
  categories: Category[];
  rows: Row[];
  active: number;
  onChoose: (row: Row) => void;
  onClose: () => void;
}) {
  if (recents.length === 0) {
    return (
      <div className="px-5 py-4 max-md:h-[calc(100dvh-7rem)]">
        <h2 className="text-sm font-bold text-ink">최근 검색어</h2>
        <p className="mt-1 text-xs-plus text-ink-3">아직 검색한 상품이 없어요</p>
        <h2 className="mt-5 text-sm font-bold text-ink">카테고리로 찾아보기</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <li key={category.slug}>
              <Link
                to={`/category/${category.slug}`}
                onClick={onClose}
                className="inline-flex h-11 items-center rounded-md border border-ink bg-ground px-5 text-sm font-bold text-ink"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="max-md:h-[calc(100dvh-7rem)]">
      <div className="flex h-12 items-center justify-between px-4 md:px-5">
        <h2 className="text-sm font-bold text-ink">최근 검색어</h2>
        <button type="button" onClick={clearRecentSearches} className="text-xs-plus font-semibold text-ink-2 md:hidden">
          전체 지우기
        </button>
      </div>
      <ul>
        {rows.map((row, index) =>
          row.kind === "recent" ? (
            <li key={row.term} className={`flex h-12 items-center pr-4 pl-4 md:px-5 ${index === active ? "bg-canvas" : ""} max-md:border-b max-md:border-line`}>
              <button type="button" onClick={() => {
                  onChoose(row);
                }}
                className={`${rowBase} h-full min-w-0 flex-1`}
              >
                <span className="truncate">{row.term}</span>
              </button>
              <button
                type="button"
                aria-label={`최근 검색어 '${row.term}' 삭제`}
                onClick={() => {
                  removeRecentSearch(row.term);
                }}
                className="flex size-8 items-center justify-center text-ink-3"
              >
                <Icon name="close" className="size-5" />
              </button>
            </li>
          ) : null,
        )}
      </ul>
      <div className="hidden h-12 items-center justify-between border-t border-line px-5 text-xs-plus font-semibold text-ink-2 md:flex">
        <button type="button" onClick={clearRecentSearches}>
          전체 지우기
        </button>
        <button type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

function SuggestLayer({
  query,
  suggest,
  rows,
  active,
  onChoose,
}: {
  query: string;
  suggest: SuggestState;
  rows: Row[];
  active: number;
  onChoose: (row: Row) => void;
}) {
  let body: ReactNode;
  if (suggest.status === "error") {
    body = <p className="px-5 py-4 text-sm text-danger">자동완성을 불러오지 못했어요. 검색어를 입력하고 검색 버튼을 눌러 보세요.</p>;
  } else if (suggest.status !== "ready") {
    body = (
      <ul aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <li key={index} className="flex h-11 items-center px-5">
            <div className="h-4 w-1/3 animate-pulse rounded-sm bg-line" />
          </li>
        ))}
      </ul>
    );
  } else if (rows.length === 0) {
    body = <p className="px-5 py-4 text-sm text-ink-2">'{query}'와 이름이 맞는 상품이 없어요. 검색 버튼을 누르면 결과 화면에서 다시 확인할 수 있어요.</p>;
  } else {
    body = (
      <ul>
        {rows.map((row, index) => {
          const isActive = index === active;
          if (row.kind === "category") {
            return (
              <li key={`category-${row.slug}`}>
                <Link
                  to={searchUrl(query, row.slug)}
                  onClick={(event) => {
                    event.preventDefault();
                    onChoose(row);
                  }}
                  className={`flex h-12 items-center justify-between border-b border-line bg-accent-soft px-5 text-sm font-bold text-ink ${isActive ? "bg-accent" : ""}`}
                >
                  <span>
                    {query} · {row.name}에서 보기
                  </span>
                  <Icon name="chevronRight" />
                </Link>
              </li>
            );
          }
          if (row.kind === "product") {
            return (
              <li key={`product-${row.id}`}>
                <Link
                  to={`/products/${row.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onChoose(row);
                  }}
                  className={`${rowBase} h-11 gap-3 px-5 ${isActive ? "bg-canvas" : ""}`}
                >
                  <Icon name="search" className="size-5 text-ink-3" />
                  <span className="truncate">
                    {splitByQuery(row.name, query).map((part, partIndex) =>
                      part.match ? (
                        <strong key={partIndex} className="font-extrabold">
                          {part.text}
                        </strong>
                      ) : (
                        <span key={partIndex} className="font-normal text-ink-2">
                          {part.text}
                        </span>
                      ),
                    )}
                  </span>
                </Link>
              </li>
            );
          }
          return null;
        })}
      </ul>
    );
  }
  return <div className="max-md:h-[calc(100dvh-7rem)]">{body}</div>;
}
