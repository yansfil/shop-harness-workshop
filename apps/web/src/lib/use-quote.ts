import type { OrderQuoteResponse } from "@grabmarket/contracts";
import { callApi } from "../api/client.ts";
import { type AsyncState, useAsync } from "./use-async.ts";

export interface QuoteItem {
  productId: number;
  quantity: number;
}

export type QuoteState = AsyncState<OrderQuoteResponse>;

/** 금액 미리 보기(상품 합계·배송비·결제 금액·부족 수량). 배송비 규칙은 서버 한 곳에만 있어서 화면은 응답을 그대로 보인다. */
export function useQuote(items: readonly QuoteItem[], attempt = 0): QuoteState {
  const key = items.length === 0 ? null : `${attempt}:${items.map((item) => `${item.productId}x${item.quantity}`).join(",")}`;
  return useAsync(key, () => callApi("quoteOrder", { body: { items: items.map(({ productId, quantity }) => ({ productId, quantity })) } }));
}
