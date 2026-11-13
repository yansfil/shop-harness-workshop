import { type ProductDetail } from "@grabmarket/contracts";
import { callApi, isApiError } from "../api/client.ts";
import { clampQuantity, type CartLine } from "../state/cart.ts";

/** 장바구니·주문서의 한 줄: 담은 줄과 서버에서 읽은 상품(없어진 상품이면 null). */
export interface PricedLine {
  line: CartLine;
  product: ProductDetail | null;
}

/** 지금 주문할 수 있는 상품인가(있고, 품절이 아니다) */
export function isOrderable(row: PricedLine): row is PricedLine & { product: ProductDetail } {
  return row.product !== null && row.product.stockQuantity > 0;
}

/** 재고가 줄었으면 재고만큼으로 맞춘 수량 */
export function effectiveQuantity(row: PricedLine & { product: ProductDetail }): number {
  return clampQuantity(row.line.quantity, row.product.stockQuantity);
}

/** 줄마다 상품을 읽어 온다. 없어진 상품(404)만 null로 두고, 나머지 실패는 그대로 올린다. */
export async function loadPricedLines(lines: readonly CartLine[]): Promise<PricedLine[]> {
  return Promise.all(
    lines.map(async (line) => {
      try {
        const { product } = await callApi("getProduct", { params: { productId: line.productId } });
        return { line, product };
      } catch (error) {
        if (isApiError(error, "NOT_FOUND")) return { line, product: null };
        throw error;
      }
    }),
  );
}
