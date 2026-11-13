import type { ProductSuggestResponse } from "@grabmarket/contracts";
import { callApi } from "../api/client.ts";
import { type AsyncState, useAsync } from "../lib/use-async.ts";

export type SuggestState = AsyncState<ProductSuggestResponse>;

const DEBOUNCE_MS = 150;

/** 검색창 자동완성. 입력이 멈춘 뒤 한 번만 부르고, 늦게 도착한 옛 응답은 버린다. q가 비면 아무것도 부르지 않는다. */
export function useSuggestions(q: string): SuggestState {
  return useAsync(q === "" ? null : q, () => callApi("suggestProducts", { query: { q } }), DEBOUNCE_MS);
}
