import { ORDER_STATUS_LABELS, type OrderStatus } from "@grabmarket/contracts";

const TONES: Record<OrderStatus, string> = {
  paid: "bg-status-paid-bg text-status-paid-text",
  preparing: "bg-status-preparing-bg text-status-preparing-text",
  shipping: "bg-status-shipping-bg text-status-shipping-text",
  delivered: "bg-status-delivered-bg text-status-delivered-text",
  cancelled: "bg-soldout-bg text-soldout-text",
};

export function StatusBadge({ status, className = "" }: { status: OrderStatus; className?: string }) {
  return (
    <span className={`inline-flex h-5 items-center rounded-sm px-2 text-xs font-bold whitespace-nowrap ${TONES[status]} ${className}`}>
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}
