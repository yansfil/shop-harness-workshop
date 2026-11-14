import { ORDER_STATUS_LABELS, type OrderStatus } from "@grabmarket/contracts";

/** 배송이 나아가는 단계 순서. 주문 상세 단계 막대와 고객센터 배송 상태 안내가 쓴다. */
export const STEPS: OrderStatus[] = ["paid", "preparing", "shipping", "delivered"];

/** 취소된 주문은 단계가 이어지지 않으므로 막대 대신 한 줄로 알린다. */
function CancelledNote() {
  return <p className="rounded-sm bg-soldout-bg px-4 py-3 text-sm font-bold text-soldout-text">취소된 주문이에요</p>;
}

/** 결제완료 → 배송준비 → 배송중 → 배송완료 중 지금 단계를 보인다. 지난 단계는 진하게, 지금 단계는 보조색 막대, 앞으로는 옅게. */
export function OrderSteps({ status }: { status: OrderStatus }) {
  if (status === "cancelled") return <CancelledNote />;
  const current = STEPS.indexOf(status);
  return (
    <ol aria-label="주문 단계" className="grid grid-cols-4 gap-1">
      {STEPS.map((step, index) => (
        <li key={step} aria-current={index === current ? "step" : undefined}>
          <div
            aria-hidden="true"
            className={`h-1.5 rounded-sm ${index < current ? "bg-ink" : index === current ? "border border-ink bg-accent" : "bg-line"}`}
          />
          <p className={`mt-2 text-xs-plus ${index === current ? "font-extrabold text-ink" : "text-ink-2"}`}>{ORDER_STATUS_LABELS[step]}</p>
        </li>
      ))}
    </ol>
  );
}
