// 반품으로 돌아온 상품을 재고에 다시 넣는다. 재고 수량은 InventoryService만 바꾼다.
import { getServices, nowIso, toDate } from "../../legacy/legacyUtils.ts";

export function restoreReturnedStock(orderId: number, lines: any[], memo: string, atIso?: string): void {
  const stockLines = lines.map((line: any) => ({ productId: Number(line.product_id), productName: String(line.product_name ?? ""), quantity: Number(line.quantity) }));
  getServices().inventory.restoreForOrder(orderId, stockLines, memo, toDate(atIso || nowIso()));
}
