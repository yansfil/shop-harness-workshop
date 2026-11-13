import type { Database } from "@grabmarket/db";
import { selectAll } from "../../shared/infra/rows.ts";
import type { InventoryItem, InventoryRepository, MovementKind, NewMovement, StockMovement } from "../domain/stock.ts";

interface ItemRow {
  product_id: number;
  product_name: string;
  category_name: string;
  quantity: number;
  safety_stock: number;
  updated_at: string;
}

interface MovementRow {
  id: number;
  product_id: number;
  kind: MovementKind;
  quantity_delta: number;
  quantity_after: number;
  order_number: string | null;
  memo: string | null;
  created_by_name: string | null;
  created_at: string;
}

const ITEM_SELECT = `
  SELECT i.product_id, p.name AS product_name, c.name AS category_name, i.quantity, i.safety_stock, i.updated_at
    FROM inventory i
    JOIN products p ON p.id = i.product_id
    JOIN categories c ON c.id = p.category_id`;

const MOVEMENT_SELECT = `
  SELECT m.id, m.product_id, m.kind, m.quantity_delta, m.quantity_after, o.order_number, m.memo,
         u.name AS created_by_name, m.created_at
    FROM inventory_movements m
    LEFT JOIN orders o ON o.id = m.order_id
    LEFT JOIN users u ON u.id = m.created_by`;

function toItem(row: ItemRow): InventoryItem {
  return {
    productId: row.product_id,
    productName: row.product_name,
    categoryName: row.category_name,
    quantity: row.quantity,
    safetyStock: row.safety_stock,
    updatedAt: new Date(row.updated_at),
  };
}

function toMovement(row: MovementRow): StockMovement {
  return {
    id: row.id,
    productId: row.product_id,
    kind: row.kind,
    quantityDelta: row.quantity_delta,
    quantityAfter: row.quantity_after,
    orderNumber: row.order_number,
    memo: row.memo,
    createdByName: row.created_by_name,
    createdAt: new Date(row.created_at),
  };
}

export class SqliteInventoryRepository implements InventoryRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  list(): InventoryItem[] {
    return selectAll<ItemRow>(this.#db, `${ITEM_SELECT} ORDER BY i.product_id`).map(toItem);
  }

  findItem(productId: number): InventoryItem | undefined {
    const row = selectAll<ItemRow>(this.#db, `${ITEM_SELECT} WHERE i.product_id = ?`, productId)[0];
    return row === undefined ? undefined : toItem(row);
  }

  quantities(productIds: number[]): Map<number, number> {
    if (productIds.length === 0) return new Map();
    const placeholders = productIds.map(() => "?").join(", ");
    const rows = selectAll<{ product_id: number; quantity: number }>(
      this.#db,
      `SELECT product_id, quantity FROM inventory WHERE product_id IN (${placeholders})`,
      ...productIds,
    );
    return new Map(rows.map((row) => [row.product_id, row.quantity]));
  }

  setQuantity(productId: number, quantity: number, at: Date): void {
    this.#db.prepare("UPDATE inventory SET quantity = ?, updated_at = ? WHERE product_id = ?").run(quantity, at.toISOString(), productId);
  }

  insertMovement(movement: NewMovement): StockMovement {
    const result = this.#db
      .prepare(
        `INSERT INTO inventory_movements
           (product_id, kind, quantity_delta, quantity_after, order_id, memo, idempotency_key, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        movement.productId,
        movement.kind,
        movement.quantityDelta,
        movement.quantityAfter,
        movement.orderId,
        movement.memo,
        movement.idempotencyKey,
        movement.createdBy,
        movement.createdAt.toISOString(),
      );
    const row = selectAll<MovementRow>(this.#db, `${MOVEMENT_SELECT} WHERE m.id = ?`, Number(result.lastInsertRowid))[0];
    if (row === undefined) throw new Error("방금 넣은 입출고 이력을 읽지 못했습니다");
    return toMovement(row);
  }

  findMovementByKey(idempotencyKey: string): StockMovement | undefined {
    const row = selectAll<MovementRow>(this.#db, `${MOVEMENT_SELECT} WHERE m.idempotency_key = ?`, idempotencyKey)[0];
    return row === undefined ? undefined : toMovement(row);
  }

  listMovements(productId: number): StockMovement[] {
    return selectAll<MovementRow>(this.#db, `${MOVEMENT_SELECT} WHERE m.product_id = ? ORDER BY m.created_at DESC, m.id DESC`, productId).map(toMovement);
  }
}
