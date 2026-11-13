import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store.ts";

export const MAX_RECENT_SEARCHES = 8;

function parseRecent(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === "string")) {
    throw new TypeError("최근 검색어 값이 문자열 배열이 아닙니다");
  }
  return raw.slice(0, MAX_RECENT_SEARCHES);
}

export const recentSearchStore = createPersistedStore<string[]>("grabmarket.recent-searches", parseRecent, []);

export function useRecentSearches(): string[] {
  return useSyncExternalStore(recentSearchStore.subscribe, recentSearchStore.get);
}

/** 맨 앞에 더한다. 같은 말은 하나로 합치고 MAX_RECENT_SEARCHES개를 넘으면 오래된 것부터 버린다. */
export function addRecentSearch(term: string): void {
  const trimmed = term.trim();
  if (trimmed === "") return;
  recentSearchStore.set([trimmed, ...recentSearchStore.get().filter((item) => item !== trimmed)].slice(0, MAX_RECENT_SEARCHES));
}

export function removeRecentSearch(term: string): void {
  recentSearchStore.set(recentSearchStore.get().filter((item) => item !== term));
}

export function clearRecentSearches(): void {
  recentSearchStore.set([]);
}
