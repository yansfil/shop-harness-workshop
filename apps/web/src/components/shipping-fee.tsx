import type { ShippingPolicyResponse } from "@grabmarket/contracts";
import { Suspense } from "react";
import { Await } from "react-router";
import { krw } from "../lib/format.ts";
import { Bone } from "./states.tsx";

/** 배송비 규칙 한 문장. 숫자는 배송비 정책 API 값 그대로라 규칙이 바뀌면 함께 바뀐다. */
export function ShippingFee({ shipping }: { shipping: Promise<ShippingPolicyResponse> }) {
  return (
    <Suspense fallback={<Bone className="h-5 w-48" />}>
      <Await resolve={shipping} errorElement={<span className="text-ink-3">배송비 안내를 불러오지 못했어요</span>}>
        {(policy: ShippingPolicyResponse) => `${krw(policy.freeThreshold)} 이상 주문하면 무료, 그 밖에는 ${krw(policy.fee)}`}
      </Await>
    </Suspense>
  );
}
