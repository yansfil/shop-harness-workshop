import type { ReactNode } from "react";
import { krw } from "../lib/format.ts";
import { Bone } from "./states.tsx";

/** 상품 합계 + 배송비 = 결제 금액. 금액을 아직 모르면(불러오는 중·실패) 막대나 안내로 둔다. */
export function AmountRows({
  amounts,
  status,
}: {
  amounts: { subtotal: number; shippingFee: number; total: number } | null;
  status: "loading" | "error" | "ready" | "idle";
}) {
  const cell = (value: number | undefined, className = "h-4 w-16") =>
    value !== undefined ? krw(value) : status === "error" ? "-" : <Bone className={className} />;
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-ink-3">상품 합계</dt>
        <dd className="font-semibold text-ink">{status === "idle" ? krw(0) : cell(amounts?.subtotal)}</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-ink-3">배송비</dt>
        <dd className="font-semibold text-ink">{status === "idle" ? krw(0) : cell(amounts?.shippingFee)}</dd>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-line pt-4">
        <dt className="font-bold text-ink">결제 금액</dt>
        <dd className="text-2xl leading-9 font-extrabold text-ink md:text-2xl">
          {status === "idle" ? krw(0) : cell(amounts?.total, "h-7 w-28")}
        </dd>
      </div>
    </dl>
  );
}

export function SummaryCard({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-line bg-ground p-6">{children}</div>;
}
