import type { Clock } from "@grabmarket/shared";
import type { CatalogService } from "../catalog/application/catalog-service.ts";
import type { OrderService } from "../orders/application/order-service.ts";
import type { Order } from "../orders/domain/order.ts";
import type { SessionUser } from "../shared/domain/session-user.ts";
import type { Prng } from "./prng.ts";

/** 새 주문을 한 건씩 흘려 보낸다. 주문은 HTTP 없이 같은 주문 서비스를 거치므로 재고와 이력이 실제 주문과 똑같이 바뀐다. */
export class OrderSimulator {
  readonly #orders: OrderService;
  readonly #catalog: CatalogService;
  readonly #customers: SessionUser[];
  readonly #prng: Prng;
  readonly #clock: Clock;
  #sequence = 0;

  constructor(orders: OrderService, catalog: CatalogService, customers: SessionUser[], prng: Prng, clock: Clock) {
    this.#orders = orders;
    this.#catalog = catalog;
    this.#customers = customers;
    this.#prng = prng;
    this.#clock = clock;
  }

  /** 재고가 있는 상품 1~3개를 담은 주문을 만든다. 살 수 있는 상품이 없으면 undefined. */
  placeOne(): Order | undefined {
    const inStock = this.#catalog.search({ q: "", excludeSoldOut: true, sort: "default" }).products;
    if (inStock.length === 0 || this.#customers.length === 0) return undefined;
    const customer = this.#prng.pick(this.#customers);
    const lines = new Map<number, number>();
    for (let count = this.#prng.int(1, 3); count > 0; count--) {
      const product = this.#prng.pick(inStock);
      lines.set(product.id, Math.min(this.#prng.int(1, 2), product.stockQuantity));
    }
    this.#sequence += 1;
    const { order } = this.#orders.place(customer, {
      idempotencyKey: `sim-${this.#clock.now().getTime()}-${this.#sequence}`,
      items: [...lines].map(([productId, quantity]) => ({ productId, quantity })),
      shipping: { recipientName: customer.name, phone: customer.phone ?? "", address: customer.address ?? "" },
      paymentMethod: "virtual",
    });
    return order;
  }
}
