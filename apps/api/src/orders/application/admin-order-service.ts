import type { Clock } from "@grabmarket/shared";
import type { UnitOfWork } from "../../shared/application/unit-of-work.ts";
import { notFound } from "../../shared/domain/domain-error.ts";
import { nextStatusOf, type OrderStatus, transitionStatus } from "../domain/order-status.ts";
import type { AdminOrderRow, Order, OrderRepository } from "../domain/order.ts";

export interface AdminOrderView {
  order: Order;
  /** 넘길 수 있는 다음 상태. 배송완료면 null */
  nextStatus: OrderStatus | null;
}

export class AdminOrderService {
  readonly #orders: OrderRepository;
  readonly #uow: UnitOfWork;
  readonly #clock: Clock;

  constructor(orders: OrderRepository, uow: UnitOfWork, clock: Clock) {
    this.#orders = orders;
    this.#uow = uow;
    this.#clock = clock;
  }

  list(): AdminOrderRow[] {
    return this.#orders.listAll();
  }

  get(orderId: number): AdminOrderView {
    return view(this.#require(orderId));
  }

  /** 바로 다음 단계로만 넘긴다. 이미 그 상태면 아무것도 바꾸지 않는다. */
  changeStatus(orderId: number, requested: OrderStatus): AdminOrderView {
    return this.#uow.run(() => {
      const order = this.#require(orderId);
      if (order.status === requested) return view(order);
      this.#orders.saveStatus(orderId, transitionStatus(order.status, requested), this.#clock.now());
      return view(this.#require(orderId));
    });
  }

  #require(orderId: number): Order {
    const order = this.#orders.findById(orderId);
    if (order === undefined) throw notFound("주문");
    return order;
  }
}

function view(order: Order): AdminOrderView {
  return { order, nextStatus: nextStatusOf(order.status) };
}
