// 주문서의 쿠폰·포인트 칸과 금액 미리 보기(쿠폰·포인트 포함)
import { useState } from "react";
import { Button } from "../components/button.tsx";
import { Bone } from "../components/states.tsx";
import { krw } from "../lib/format.ts";
import { type AsyncState, useAsync } from "../lib/use-async.ts";
import { legacyPost } from "./legacyApi.ts";
import { pointText, signedKrw } from "./money.ts";
import { fieldClass, labelClass } from "./ui.tsx";

/** 금액 미리 보기 응답 중 주문서가 쓰는 칸 */
export interface CheckoutQuote {
  subtotal: number;
  shippingFee: number;
  total: number;
  shortages: { productId: number; productName: string; requested: number; available: number }[];
  coupon: { code: string; name: string; label: string; discount: number } | null;
  couponProblem: { code: string; message: string } | null;
  couponDiscount: number;
  usableCoupons: { code: string; label: string; discountAmount: number; endsAtText: string }[];
  pointBalance: number;
  pointBalanceText: string;
  maxPoints: number;
  usePoints: number;
  pointProblem: { code: string; message: string } | null;
  paidAmount: number;
}

/** 쿠폰·포인트 주문 결제 (예전 결제 흐름) */
export async function checkoutOrder(body: any): Promise<{ order: { id: number } }> {
  return await legacyPost("/api/checkout", body);
}

export interface Benefits {
  couponCode: string;
  usePoints: number;
}

/** 쿠폰·포인트를 넣은 금액 미리 보기. 입력이 바뀌면 300ms 뒤 다시 묻는다 */
export function useCheckoutQuote(items: { productId: number; quantity: number }[], benefits: Benefits, attempt: number): AsyncState<CheckoutQuote> {
  const key = items.length === 0 ? null : attempt + ":" + items.map((i) => i.productId + "x" + i.quantity).join(",") + ":" + benefits.couponCode + ":" + benefits.usePoints;
  return useAsync(key, () => legacyPost("/api/checkout/quote", { items: items, couponCode: benefits.couponCode, usePoints: benefits.usePoints }), 300);
}

/** 적립 예정 포인트: 결제 금액의 1% */
export function rewardFor(paidAmount: number): number {
  if (paidAmount <= 0) return 0;
  return Math.floor(paidAmount * 0.01);
}

export function BenefitsSection({ quote, benefits, onChange }: { quote: AsyncState<CheckoutQuote>; benefits: Benefits; onChange: (b: Benefits) => void }) {
  const data = quote.status === "ready" ? quote.data : null;
  const [code, setCode] = useState(benefits.couponCode);
  const [points, setPoints] = useState(benefits.usePoints > 0 ? String(benefits.usePoints) : "");
  return (
    <section aria-labelledby="benefit-title" className="border-t border-line p-4 md:p-6">
      <h2 id="benefit-title" className="text-base font-extrabold text-ink">
        쿠폰·포인트
      </h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="coupon-code" className={labelClass}>
            쿠폰 {data ? <span className="font-normal text-ink-3">· 쓸 수 있는 쿠폰 {data.usableCoupons.length}장</span> : null}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="coupon-code"
              className={fieldClass}
              placeholder="쿠폰 코드"
              value={code}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase());
              }}
            />
            {benefits.couponCode !== "" ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-10 shrink-0"
                onClick={() => {
                  setCode("");
                  onChange({ ...benefits, couponCode: "" });
                }}
              >
                빼기
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="h-10 shrink-0"
                disabled={code.trim() === ""}
                onClick={() => {
                  onChange({ ...benefits, couponCode: code.trim() });
                }}
              >
                적용
              </Button>
            )}
          </div>
          {data && data.usableCoupons.length > 0 && benefits.couponCode === "" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.usableCoupons.map((c: any) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                    setCode(c.code);
                    onChange({ ...benefits, couponCode: c.code });
                  }}
                  className="rounded-pill border border-line bg-ground px-2.5 py-1 text-xs font-semibold text-ink-2"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {data && data.coupon && <p className="mt-1.5 text-xs-plus font-semibold text-ink">{data.coupon.label} 적용</p>}
          {data && data.couponProblem && (
            <p role="alert" className="mt-1.5 text-xs-plus font-semibold text-danger">
              {data.couponProblem.message}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="use-points" className={labelClass}>
            포인트 {data ? <span className="font-normal text-ink-3">· 보유 {data.pointBalanceText}</span> : null}
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="use-points"
              className={fieldClass}
              inputMode="numeric"
              placeholder="0"
              value={points}
              onChange={(event) => {
                setPoints(event.target.value.replace(/[^0-9]/g, ""));
              }}
              onBlur={() => {
                onChange({ ...benefits, usePoints: Number(points || 0) });
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-10 shrink-0"
              disabled={!data || data.maxPoints <= 0}
              onClick={() => {
                if (!data) return;
                setPoints(String(data.maxPoints));
                onChange({ ...benefits, usePoints: data.maxPoints });
              }}
            >
              전액 사용
            </Button>
          </div>
          {data && data.pointProblem ? (
            <p role="alert" className="mt-1.5 text-xs-plus font-semibold text-danger">
              {data.pointProblem.message}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-ink-3">1P = 1원 · 이번 주문에 최대 {data ? pointText(data.maxPoints) : "-"}</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** 상품 합계 + 배송비 - 쿠폰 - 포인트 = 결제 금액, 그리고 적립 예정 포인트 */
export function BenefitAmountRows({ quote }: { quote: AsyncState<CheckoutQuote> }) {
  const data = quote.status === "ready" ? quote.data : null;
  const cell = (render: (d: any) => string) => (data ? render(data) : quote.status === "error" ? "-" : <Bone className="h-4 w-16" />);
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <dt className="text-ink-3">상품 합계</dt>
        <dd className="font-semibold text-ink">{cell((d) => krw(d.subtotal))}</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-ink-3">배송비</dt>
        <dd className="font-semibold text-ink">{cell((d) => krw(d.shippingFee))}</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-ink-3">쿠폰 할인</dt>
        <dd className="font-semibold text-ink">{cell((d) => signedKrw(-d.couponDiscount))}</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-ink-3">포인트 사용</dt>
        <dd className="font-semibold text-ink">{cell((d) => signedKrw(-d.usePoints))}</dd>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-line pt-4">
        <dt className="font-bold text-ink">결제 금액</dt>
        <dd className="text-2xl leading-9 font-extrabold text-ink">{data ? krw(data.paidAmount) : quote.status === "error" ? "-" : <Bone className="h-7 w-28" />}</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-ink-3">적립 예정 포인트</dt>
        <dd className="font-semibold text-ink">{cell((d) => pointText(rewardFor(d.paidAmount)))}</dd>
      </div>
    </dl>
  );
}
