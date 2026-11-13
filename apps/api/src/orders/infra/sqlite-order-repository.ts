import type { Database } from "@grabmarket/db";
import { won } from "@grabmarket/shared";
import { selectAll } from "../../shared/infra/rows.ts";
import { INITIAL_ORDER_STATUS, type OrderStatus } from "../domain/order-status.ts";
import type {
  AdminOrderFilter,
  AdminOrderPaging,
  AdminOrderSlice,
  NewOrder,
  Order,
  OrderRepository,
  OrderStatusCounts,
  PricedLine,
} from "../domain/order.ts";

interface OrderRow {
  id: number;
  order_number: string;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  status: OrderStatus;
  subtotal: number;
  shipping_fee: number;
  total: number;
  payment_method: "virtual";
  recipient_name: string;
  recipient_phone: string;
  shipping_address: string;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  order_id: number;
  product_id: number;
  product_name: string;
  image_path: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

const ORDER_SELECT = `
  SELECT o.id, o.order_number, o.customer_id, u.name AS customer_name, u.email AS customer_email, o.status,
         o.subtotal, o.shipping_fee, o.total, o.payment_method,
         o.recipient_name, o.recipient_phone, o.shipping_address, o.created_at, o.updated_at
    FROM orders o JOIN users u ON u.id = o.customer_id`;

function where(conditions: string[]): string {
  return conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
}

/** 주문번호나 고객 이름에 q가 들어 있는 주문. LIKE의 와일드카드(%, _)는 글자 그대로 찾는다. */
function addSearch(q: string, conditions: string[], params: (string | number)[]): void {
  if (q === "") return;
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  conditions.push("(o.order_number LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')");
  params.push(pattern, pattern);
}

export class SqliteOrderRepository implements OrderRepository {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  insert(order: NewOrder): Order {
    const at = order.createdAt.toISOString();
    const result = this.#db
      .prepare(
        `INSERT INTO orders
           (order_number, customer_id, status, subtotal, shipping_fee, total, payment_method,
            recipient_name, recipient_phone, shipping_address, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        order.number,
        order.customerId,
        INITIAL_ORDER_STATUS,
        order.subtotal,
        order.shippingFee,
        order.total,
        order.paymentMethod,
        order.shipping.recipientName,
        order.shipping.phone,
        order.shipping.address,
        order.idempotencyKey,
        at,
        at,
      );
    const orderId = Number(result.lastInsertRowid);
    const insertItem = this.#db.prepare(
      "INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const item of order.items) {
      insertItem.run(orderId, item.productId, item.productName, item.unitPrice, item.quantity, item.lineTotal);
    }
    const saved = this.findById(orderId);
    if (saved === undefined) throw new Error("방금 만든 주문을 읽지 못했습니다");
    return saved;
  }

  countOnDay(dayKey: string): number {
    const row = selectAll<{ count: number }>(this.#db, "SELECT COUNT(*) AS count FROM orders WHERE order_number LIKE ?", `GM-${dayKey}-%`)[0];
    return row?.count ?? 0;
  }

  findByIdempotencyKey(customerId: number, idempotencyKey: string): Order | undefined {
    return this.#hydrateOne(selectAll<OrderRow>(this.#db, `${ORDER_SELECT} WHERE o.customer_id = ? AND o.idempotency_key = ?`, customerId, idempotencyKey));
  }

  findById(orderId: number): Order | undefined {
    return this.#hydrateOne(selectAll<OrderRow>(this.#db, `${ORDER_SELECT} WHERE o.id = ?`, orderId));
  }

  findForCustomer(customerId: number, orderId: number): Order | undefined {
    return this.#hydrateOne(selectAll<OrderRow>(this.#db, `${ORDER_SELECT} WHERE o.id = ? AND o.customer_id = ?`, orderId, customerId));
  }

  listByCustomer(customerId: number): Order[] {
    return this.#hydrate(selectAll<OrderRow>(this.#db, `${ORDER_SELECT} WHERE o.customer_id = ? ORDER BY o.created_at DESC, o.id DESC`, customerId));
  }

  listAdmin(filter: AdminOrderFilter, paging: AdminOrderPaging): AdminOrderSlice {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (filter.status !== undefined) {
      conditions.push("o.status = ?");
      params.push(filter.status);
    }
    addSearch(filter.q, conditions, params);
    if (paging.kind === "after") {
      const at = paging.after.createdAt.toISOString();
      conditions.push("(o.created_at < ? OR (o.created_at = ? AND o.id < ?))");
      params.push(at, at, paging.after.id);
    }
    const offset = paging.kind === "page" ? (paging.page - 1) * paging.pageSize : 0;
    // 한 줄 더 읽어서 뒤에 주문이 남았는지 안다.
    const rows = selectAll<{ id: number; order_number: string; customer_name: string; status: OrderStatus; total: number; item_count: number; first_item_name: string; created_at: string }>(
      this.#db,
      `SELECT o.id, o.order_number, u.name AS customer_name, o.status, o.total, o.created_at,
              (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count,
              (SELECT i.product_name FROM order_items i WHERE i.order_id = o.id ORDER BY i.id LIMIT 1) AS first_item_name
         FROM orders o JOIN users u ON u.id = o.customer_id
        ${where(conditions)}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ? OFFSET ?`,
      ...params,
      paging.pageSize + 1,
      offset,
    );
    return {
      hasMore: rows.length > paging.pageSize,
      rows: rows.slice(0, paging.pageSize).map((row) => ({
        id: row.id,
        number: row.order_number,
        customerName: row.customer_name,
        status: row.status,
        total: won(row.total),
        itemCount: row.item_count,
        firstItemName: row.first_item_name,
        createdAt: new Date(row.created_at),
      })),
    };
  }

  countByStatus(q: string): OrderStatusCounts {
    const conditions: string[] = [];
    const params: string[] = [];
    addSearch(q, conditions, params);
    const counts: OrderStatusCounts = { paid: 0, preparing: 0, shipping: 0, delivered: 0 };
    const rows = selectAll<{ status: OrderStatus; count: number }>(
      this.#db,
      `SELECT o.status, COUNT(*) AS count FROM orders o JOIN users u ON u.id = o.customer_id ${where(conditions)} GROUP BY o.status`,
      ...params,
    );
    for (const row of rows) counts[row.status] = row.count;
    return counts;
  }

  saveStatus(orderId: number, status: OrderStatus, at: Date): void {
    this.#db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, at.toISOString(), orderId);
  }

  #hydrateOne(rows: OrderRow[]): Order | undefined {
    return this.#hydrate(rows)[0];
  }

  #hydrate(rows: OrderRow[]): Order[] {
    if (rows.length === 0) return [];
    const placeholders = rows.map(() => "?").join(", ");
    const items = selectAll<ItemRow>(
      this.#db,
      `SELECT i.order_id, i.product_id, i.product_name, p.image_path, i.unit_price, i.quantity, i.line_total
         FROM order_items i JOIN products p ON p.id = i.product_id
        WHERE i.order_id IN (${placeholders}) ORDER BY i.id`,
      ...rows.map((row) => row.id),
    );
    const byOrder = new Map<number, PricedLine[]>();
    for (const item of items) {
      const line: PricedLine = {
        productId: item.product_id,
        productName: item.product_name,
        imagePath: item.image_path,
        unitPrice: won(item.unit_price),
        quantity: item.quantity,
        lineTotal: won(item.line_total),
      };
      byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), line]);
    }
    return rows.map((row) => ({
      id: row.id,
      number: row.order_number,
      customer: { id: row.customer_id, name: row.customer_name, email: row.customer_email },
      status: row.status,
      items: byOrder.get(row.id) ?? [],
      subtotal: won(row.subtotal),
      shippingFee: won(row.shipping_fee),
      total: won(row.total),
      paymentMethod: row.payment_method,
      shipping: { recipientName: row.recipient_name, phone: row.recipient_phone, address: row.shipping_address },
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }
}
