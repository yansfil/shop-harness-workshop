// 반품으로 돌아온 상품을 재고에 다시 넣는다
import { getDb, nowIso, toDate } from "../../legacy/legacyUtils.ts";
import { SqliteInventoryRepository } from "../../inventory/infra/sqlite-inventory-repository.ts";

export function restoreReturnedStock(orderId: number, lines: any[], memo: string, atIso?: string): void {
  const repo = new SqliteInventoryRepository(getDb());
  const at = toDate(atIso || nowIso());
  const quantities = repo.quantities(lines.map((l: any) => Number(l.product_id)));
  for (const line of lines) {
    const productId = Number(line.product_id);
    const after = (quantities.get(productId) || 0) + Number(line.quantity);
    quantities.set(productId, after);
    repo.setQuantity(productId, after, at);
    repo.insertMovement({
      productId: productId,
      kind: "inbound",
      quantityDelta: Number(line.quantity),
      quantityAfter: after,
      orderId: orderId,
      memo: memo,
      idempotencyKey: null,
      createdBy: null,
      createdAt: at,
    });
  }
}
