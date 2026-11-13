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

/** 배송이 시작되기 전(결제완료·배송준비)에만 취소할 수 있다. 배송중부터는 반품으로 처리한다. */
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = ["paid", "preparing"];

export class InvalidStatusTransitionError extends DomainError {
  constructor(current: OrderStatus, requested: OrderStatus) {
    super("INVALID_STATUS_TRANSITION", `주문 상태를 ${current}에서 ${requested}(으)로 바꿀 수 없습니다. 바로 다음 단계로만 넘길 수 있습니다.`);
  }
}

export function nextStatusOf(current: OrderStatus): OrderStatus | null {
  return NEXT_STATUS[current];
}

/** 주문 상태를 바꾸는 유일한 길. 바로 다음 단계가 아니면 던진다. */
export function transitionStatus(current: OrderStatus, requested: OrderStatus): OrderStatus {
  if (NEXT_STATUS[current] !== requested) throw new InvalidStatusTransitionError(current, requested);
  return requested;
}

export class OrderNotCancellableError extends DomainError {
  constructor(current: OrderStatus) {
    super(
      "ORDER_NOT_CANCELLABLE",
      current === "cancelled" ? "이미 취소된 주문입니다." : "배송이 시작된 주문은 취소할 수 없습니다. 배송이 끝난 뒤 반품을 신청해 주세요.",
    );
  }
}

export function isCancellable(current: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(current);
}

/** 취소도 전이 함수로만 한다. 결제완료·배송준비가 아니면 던진다. */
export function cancelStatus(current: OrderStatus): OrderStatus {
  if (!isCancellable(current)) throw new OrderNotCancellableError(current);
  return "cancelled";
}
