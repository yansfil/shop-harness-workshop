import { DomainError } from "../../shared/domain/domain-error.ts";

export type OrderStatus = "paid" | "preparing" | "shipping" | "delivered" | "cancelled";

/** 새 주문의 첫 상태. 가짜 결제는 항상 승인되므로 주문은 결제완료로 시작한다. */
export const INITIAL_ORDER_STATUS: OrderStatus = "paid";

const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  paid: "preparing",
  preparing: "shipping",
  shipping: "delivered",
  delivered: null,
  cancelled: null,
};

/** 고객이 취소할 수 있는 상태. 배송이 시작되면 취소할 수 없다. */
const CANCELLABLE: ReadonlySet<OrderStatus> = new Set(["paid", "preparing"]);

export class InvalidStatusTransitionError extends DomainError {
  constructor(current: OrderStatus, requested: OrderStatus) {
    super("INVALID_STATUS_TRANSITION", `주문 상태를 ${current}에서 ${requested}(으)로 바꿀 수 없습니다. 바로 다음 단계로만 넘길 수 있습니다.`);
  }
}

export class OrderNotCancellableError extends DomainError {
  constructor() {
    super("ORDER_NOT_CANCELLABLE", "배송이 시작된 주문은 취소할 수 없습니다.");
  }
}

export function canCancel(current: OrderStatus): boolean {
  return CANCELLABLE.has(current);
}

export function nextStatusOf(current: OrderStatus): OrderStatus | null {
  return NEXT_STATUS[current];
}

/** 주문 상태를 바꾸는 유일한 길. 바로 다음 단계가 아니면 던진다. */
export function transitionStatus(current: OrderStatus, requested: OrderStatus): OrderStatus {
  if (NEXT_STATUS[current] !== requested) throw new InvalidStatusTransitionError(current, requested);
  return requested;
}

/** 주문을 취소 상태로 바꾸는 유일한 길. 결제완료·배송준비가 아니면 던진다. */
export function cancelStatus(current: OrderStatus): OrderStatus {
  if (!canCancel(current)) throw new OrderNotCancellableError();
  return "cancelled";
}
