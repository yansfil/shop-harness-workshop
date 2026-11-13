import { DomainError, type StockShortage } from "../../shared/domain/domain-error.ts";

export type { StockShortage };

export interface StockLine {
  productId: number;
  productName: string;
  quantity: number;
}

export interface InventoryItem {
  productId: number;
  productName: string;
  categoryName: string;
  quantity: number;
  safetyStock: number;
  updatedAt: Date;
}

/** 안전재고 미만인지. 품절(0)도 미만이고, 안전재고와 같으면 미만이 아니다. */
export function isLowStock(item: Pick<InventoryItem, "quantity" | "safetyStock">): boolean {
  return item.quantity < item.safetyStock;
}

export type MovementKind = "inbound" | "outbound" | "restock";

export interface StockMovement {
  id: number;
  productId: number;
  kind: MovementKind;
  /** 입고·취소 복구 +, 출고 - */
  quantityDelta: number;
  quantityAfter: number;
  orderNumber: string | null;
  memo: string | null;
  createdByName: string | null;
  createdAt: Date;
}

export interface NewMovement {
  productId: number;
  kind: MovementKind;
  quantityDelta: number;
  quantityAfter: number;
  orderId: number | null;
  memo: string | null;
  idempotencyKey: string | null;
  createdBy: number | null;
  createdAt: Date;
}

export class InsufficientStockError extends DomainError {
  constructor(shortages: StockShortage[]) {
    super("INSUFFICIENT_STOCK", "재고가 부족한 상품이 있습니다.", shortages);
  }
}

/** 재고가 모자란 줄을 찾는다. 없으면 빈 배열. */
export function findShortages(lines: StockLine[], quantities: ReadonlyMap<number, number>): StockShortage[] {
  const shortages: StockShortage[] = [];
  for (const line of lines) {
    const available = quantities.get(line.productId) ?? 0;
    if (available < line.quantity) {
      shortages.push({ productId: line.productId, productName: line.productName, requested: line.quantity, available });
    }
  }
  return shortages;
}

export interface InventoryRepository {
  list(): InventoryItem[];
  findItem(productId: number): InventoryItem | undefined;
  quantities(productIds: number[]): Map<number, number>;
  setQuantity(productId: number, quantity: number, at: Date): void;
  insertMovement(movement: NewMovement): StockMovement;
  findMovementByKey(idempotencyKey: string): StockMovement | undefined;
  /** 최신순 전부 */
  listMovements(productId: number): StockMovement[];
}
