import type { Clock } from "@grabmarket/shared";
import type { CatalogService } from "../../catalog/application/catalog-service.ts";
import type { InventoryService } from "../../inventory/application/inventory-service.ts";
import { InsufficientStockError, type StockLine, type StockShortage } from "../../inventory/domain/stock.ts";
import type { UnitOfWork } from "../../shared/application/unit-of-work.ts";
import { DomainError, notFound } from "../../shared/domain/domain-error.ts";
import type { SessionUser } from "../../shared/domain/session-user.ts";
import {
  type CartLine,
  formatOrderNumber,
  isSameRequest,
  type Order,
  type OrderCancelListener,
  type OrderRepository,
  orderDayKey,
  type PlaceOrderInput,
  priceOrder,
  type PricedOrder,
} from "../domain/order.ts";
import { cancelStatus } from "../domain/order-status.ts";

export interface Quote extends PricedOrder {
  shortages: StockShortage[];
}

export interface PlacedOrder {
  /** 같은 멱등 키의 다시 보낸 요청이면 false(처음 주문을 그대로 돌려준다) */
  created: boolean;
  order: Order;
}

export class OrderService {
  readonly #orders: OrderRepository;
  readonly #catalog: CatalogService;
  readonly #inventory: InventoryService;
  readonly #uow: UnitOfWork;
  readonly #clock: Clock;
  readonly #cancelListeners: OrderCancelListener[];

  constructor(
    orders: OrderRepository,
    catalog: CatalogService,
    inventory: InventoryService,
    uow: UnitOfWork,
    clock: Clock,
    cancelListeners: OrderCancelListener[] = [],
  ) {
    this.#orders = orders;
    this.#catalog = catalog;
    this.#inventory = inventory;
    this.#uow = uow;
    this.#clock = clock;
    this.#cancelListeners = cancelListeners;
  }

  /** 장바구니 금액 미리 보기. 재고가 모자라도 오류가 아니라 shortages로 알린다. */
  quote(lines: CartLine[]): Quote {
    const priced = this.#price(lines);
    return { ...priced, shortages: this.#inventory.findShortages(stockLines(priced)) };
  }

  /**
   * 주문 한 건을 한 트랜잭션으로 만든다: 가격 재계산 → 가짜 결제(항상 승인) → 재고 차감.
   * 재고가 하나라도 모자라면 주문도 재고 변화도 남지 않는다.
   */
  place(buyer: SessionUser, input: PlaceOrderInput): PlacedOrder {
    if (buyer.role !== "customer") {
      throw new DomainError("ADMIN_CANNOT_ORDER", "관리자 계정으로는 주문할 수 없습니다. 고객 계정으로 로그인해 주세요.");
    }
    return this.#uow.run(() => {
      const existing = this.#orders.findByIdempotencyKey(buyer.id, input.idempotencyKey);
      if (existing !== undefined) {
        if (!isSameRequest(existing, input)) {
          throw new DomainError("IDEMPOTENCY_KEY_REUSED", "같은 요청 번호로 다른 주문을 보낼 수 없습니다.");
        }
        return { created: false, order: existing };
      }
      const priced = this.#price(input.items);
      const now = this.#clock.now();
      const order = this.#orders.insert({
        ...priced,
        number: formatOrderNumber(now, this.#orders.countOnDay(orderDayKey(now)) + 1),
        customerId: buyer.id,
        idempotencyKey: input.idempotencyKey,
        paymentMethod: input.paymentMethod,
        shipping: input.shipping,
        createdAt: now,
      });
      const shortages = this.#inventory.decreaseForOrder(order.id, stockLines(priced));
      if (shortages.length > 0) throw new InsufficientStockError(shortages);
      return { created: true, order };
    });
  }

  /**
   * 내 주문을 취소한다: 상태 전이(결제완료·배송준비만) → 재고 되돌리기 → 후속 처리, 모두 한 트랜잭션.
   * 이미 취소된 주문이면 아무것도 바꾸지 않고 그대로 돌려준다(다시 보내도 같은 결과).
   */
  cancel(buyer: SessionUser, orderId: number, reason: string | null): Order {
    return this.#uow.run(() => {
      const order = this.#orders.findForCustomer(buyer.id, orderId);
      if (order === undefined) throw notFound("주문");
      if (order.status === "cancelled") return order;
      const next = cancelStatus(order.status);
      const now = this.#clock.now();
      this.#orders.saveStatus(order.id, next, now);
      this.#orders.insertCancellation({ orderId: order.id, customerId: buyer.id, previousStatus: order.status, reason, at: now });
      this.#inventory.restoreForOrder(order.id, stockLines(order), "주문 취소");
      const cancelled = this.#orders.findById(order.id);
      if (cancelled === undefined) throw new Error(`취소한 주문 ${order.number}을 다시 읽지 못했습니다`);
      for (const listener of this.#cancelListeners) listener.orderCancelled(cancelled, now);
      return cancelled;
    });
  }

  #price(lines: CartLine[]): PricedOrder {
    const products = this.#catalog.getProductsForOrder(lines.map((line) => line.productId));
    return priceOrder(products.map((product) => ({ id: product.id, name: product.name, price: product.price, imagePath: product.imagePath })), lines);
  }
}

function stockLines(priced: PricedOrder): StockLine[] {
  return priced.items.map((item) => ({ productId: item.productId, productName: item.productName, quantity: item.quantity }));
}
