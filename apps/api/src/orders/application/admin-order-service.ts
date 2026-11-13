import type { Clock } from "@grabmarket/shared";
import type { UnitOfWork } from "../../shared/application/unit-of-work.ts";
import { notFound } from "../../shared/domain/domain-error.ts";
import { nextStatusOf, type OrderStatus, transitionStatus } from "../domain/order-status.ts";
import type { AdminOrderFilter, AdminOrderPaging, AdminOrderRow, Order, OrderPosition, OrderRepository, OrderStatusCounts } from "../domain/order.ts";

export interface AdminOrderView {
  order: Order;
  /** 넘길 수 있는 다음 상태. 배송완료면 null */
  nextStatus: OrderStatus | null;
}

export interface AdminOrderListRequest extends AdminOrderFilter {
  paging: AdminOrderPaging;
}

export interface AdminOrderPage {
  rows: AdminOrderRow[];
  /** status·q 조건에 맞는 주문 전체 수 */
  total: number;
  /** 상태 칩의 개수. q만 적용하고 status는 보지 않는다 */
  counts: OrderStatusCounts & { all: number };
  /** 번호 방식이면 지금 페이지, 커서 방식이면 null */
  page: number | null;
  pageSize: number;
  pageCount: number;
  /** 다음 페이지가 시작되는 바로 앞 자리(이 조각의 마지막 주문). 마지막 페이지면 null */
  after: OrderPosition | null;
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

  list({ paging, ...filter }: AdminOrderListRequest): AdminOrderPage {
    const byStatus = this.#orders.countByStatus(filter.q);
    const all = byStatus.paid + byStatus.preparing + byStatus.shipping + byStatus.delivered;
    const total = filter.status === undefined ? all : byStatus[filter.status];
    const { rows, hasMore } = this.#orders.listAdmin(filter, paging);
    const last = rows.at(-1);
    return {
      rows,
      total,
      counts: { ...byStatus, all },
      page: paging.kind === "page" ? paging.page : null,
      pageSize: paging.pageSize,
      pageCount: Math.ceil(total / paging.pageSize),
      after: hasMore && last !== undefined ? { createdAt: last.createdAt, id: last.id } : null,
    };
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
