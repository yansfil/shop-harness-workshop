import { streamed } from "../lib/streamed.ts";
import type { ShippingInfo, StockShortage } from "@grabmarket/contracts";
import { PAYMENT_METHOD_LABELS } from "@grabmarket/contracts";
import { useRef, useState } from "react";
import { Link, Navigate, type LoaderFunctionArgs, redirect, useLoaderData, useLocation, useNavigate } from "react-router";
import { ApiError, isApiError } from "../api/client.ts";
import { AdminOrderNotice } from "../components/admin-order-notice.tsx";
import { Button, LinkButton } from "../components/button.tsx";
import { Loaded } from "../components/loaded.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { Page } from "../components/page.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { SummaryCard } from "../components/summary-box.tsx";
import { type Benefits, BenefitAmountRows, BenefitsSection, checkoutOrder, rewardFor, useCheckoutQuote } from "../legacy/checkout-benefits.tsx";
import { effectiveQuantity, isOrderable, loadPricedLines, type PricedLine } from "../lib/cart-products.ts";
import { signedKrw, wonText } from "../legacy/money.ts";
import { loginPath } from "../lib/login-path.ts";
import { type CartLine, removeFromCart, selectedCartLines } from "../state/cart.ts";
import { useRootData } from "../state/root-data.ts";
import { clearShippingDraft, readShippingDraft, saveShippingDraft } from "../state/shipping-draft.ts";

/** 주문할 줄을 정한다. "바로 구매"는 주소의 productId·quantity, 그 밖에는 장바구니에서 고른 줄이다. */
export function checkoutLoader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const productId = Number(params.get("productId"));
  const quantity = Number(params.get("quantity") ?? 1);
  if (params.has("productId")) {
    if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return redirect("/");
    const lines: CartLine[] = [{ productId, quantity, selected: true }];
    return { direct: true, rows: streamed(loadPricedLines(lines)) };
  }
  const lines = selectedCartLines();
  if (lines.length === 0) return redirect("/cart");
  return { direct: false, rows: streamed(loadPricedLines(lines)) };
}

export function CheckoutPage() {
  const data = useLoaderData<typeof checkoutLoader>();
  const { user } = useRootData();
  const location = useLocation();
  if (user === null) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  return (
    <Page>
      <h1 className="mb-4 text-xl leading-8 font-extrabold text-ink">주문서</h1>
      <Loaded
        resolve={data.rows}
        failure="주문할 상품을 불러오지 못했어요"
        skeleton={
          <div aria-hidden="true" className="flex flex-col gap-3 rounded-md border border-line bg-ground p-6">
            <Bone className="h-6 w-32" />
            <Bone className="h-24 w-full" />
          </div>
        }
      >
        {(rows) => <CheckoutView rows={rows} direct={data.direct} />}
      </Loaded>
    </Page>
  );
}

function CheckoutView({ rows, direct }: { rows: PricedLine[]; direct: boolean }) {
  const { user } = useRootData();
  const navigate = useNavigate();
  const orderable = rows.filter(isOrderable);
  const items = orderable.map((row) => ({ productId: row.line.productId, quantity: effectiveQuantity(row) }));
  const [benefits, setBenefits] = useState<Benefits>({ couponCode: "", usePoints: 0 });
  const quote = useCheckoutQuote(items, benefits, 0);

  const draft = user === null ? null : readShippingDraft(user.id);
  const [shipping, setShipping] = useState<ShippingInfo>(
    draft ?? {
      recipientName: user?.name ?? "",
      phone: user?.phone ?? "",
      address: user?.address ?? "",
    },
  );
  const [editing, setEditing] = useState(user?.address == null || user.phone === null);
  const [pay, setPay] = useState<{ status: "idle" | "paying" } | { status: "failed"; error: ApiError }>({ status: "idle" });
  const [adminNotice, setAdminNotice] = useState(user?.role === "admin");
  const [shortages, setShortages] = useState<StockShortage[]>([]);
  const idempotencyKey = useRef(crypto.randomUUID());

  if (items.length === 0) {
    return (
      <EmptyState title="주문할 수 있는 상품이 없어요" hint="품절이거나 판매하지 않는 상품이에요">
        <LinkButton to={direct ? "/" : "/cart"} size="lg">
          {direct ? "쇼핑 계속하기" : "장바구니로 가기"}
        </LinkButton>
      </EmptyState>
    );
  }

  const shortageById = new Map([...(quote.status === "ready" ? quote.data.shortages : []), ...shortages].map((item) => [item.productId, item]));
  const amounts = quote.status === "ready" ? quote.data : null;
  const benefitProblem = amounts !== null && (amounts.couponProblem !== null || amounts.pointProblem !== null);
  const blocked = shortageById.size > 0;
  const paying = pay.status === "paying";

  function edit(change: Partial<ShippingInfo>) {
    const next = { ...shipping, ...change };
    setShipping(next);
    if (user !== null) saveShippingDraft(user.id, next);
    // 내용이 바뀌면 다른 주문이므로 새 멱등 키를 쓴다. 같은 내용 재시도는 같은 키로 한 번만 반영된다.
    idempotencyKey.current = crypto.randomUUID();
    setPay({ status: "idle" });
  }

  async function submit() {
    setPay({ status: "paying" });
    try {
      const { order } = await checkoutOrder({
        idempotencyKey: idempotencyKey.current,
        items,
        shipping,
        paymentMethod: "virtual",
        couponCode: benefits.couponCode,
        usePoints: benefits.usePoints,
        rewardPoints: amounts === null ? 0 : rewardFor(amounts.paidAmount),
      });
      clearShippingDraft();
      if (!direct) removeFromCart(items.map((item) => item.productId));
      void navigate(`/orders/${order.id}/complete`, { replace: true });
    } catch (error) {
      if (!isApiError(error)) throw error;
      if (error.code === "UNAUTHENTICATED") {
        void navigate(loginPath("/checkout"), { replace: true });
      } else if (error.code === "ADMIN_CANNOT_ORDER") {
        setAdminNotice(true);
        setPay({ status: "idle" });
      } else if (error.code === "INSUFFICIENT_STOCK") {
        setShortages(error.shortages ?? []);
        setPay({ status: "idle" });
      } else {
        setPay({ status: "failed", error });
      }
    }
  }

  const payButton = (
    <Button size="lg" className="w-full" disabled={blocked || paying || quote.status !== "ready" || benefitProblem} onClick={() => void submit()}>
      {paying ? "결제하는 중" : pay.status === "failed" ? "다시 시도" : "결제하기"}
    </Button>
  );

  return (
    <div className="pb-40 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-6 lg:pb-0">
      <div className="flex flex-col gap-3">
        {blocked && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-danger-soft px-4 py-3 text-xs-plus font-semibold text-danger">
            <span>재고가 부족해 결제하지 못했어요. 부족한 상품의 수량을 조정해 주세요.</span>
            <Link to={direct ? `/products/${items[0]?.productId ?? ""}` : "/cart"} className="font-bold underline">
              {direct ? "상품으로 가기" : "장바구니로 가기"}
            </Link>
          </div>
        )}
        <div className="rounded-md border border-line bg-ground">
          <section aria-labelledby="ship-title" className="border-b border-line p-4 md:p-6">
            <div className="flex items-center justify-between">
              <h2 id="ship-title" className="text-base font-extrabold text-ink">
                배송지
              </h2>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditing((value) => !value);
                }}
              >
                {editing ? "완료" : "수정"}
              </Button>
            </div>
            {editing ? (
              <ShippingForm shipping={shipping} onChange={edit} />
            ) : (
              <>
                <p className="mt-3 flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
                  <span className="rounded-sm bg-accent px-1.5 py-0.5 text-xs font-bold">기본 배송지</span>
                  {shipping.address}
                </p>
                <p className="mt-1 text-xs-plus text-ink-3">
                  {shipping.recipientName} · {shipping.phone} · 고쳐도 이번 주문에만 적용돼요
                </p>
              </>
            )}
          </section>
          <section aria-labelledby="items-title">
            <div className="flex h-12 items-center justify-between px-4 md:px-6">
              <h2 id="items-title" className="text-base font-extrabold text-ink">
                주문 상품
              </h2>
              <span className="text-xs-plus text-ink-3">{orderable.length}개</span>
            </div>
            <div className="border-t border-line">
              {orderable.map((row) => {
                const shortage = shortageById.get(row.line.productId);
                const quantity = effectiveQuantity(row);
                return (
                  <div key={row.line.productId} className="border-b border-line last:border-b-0">
                    <OrderLines
                      items={[
                        {
                          productId: row.product.id,
                          productName: row.product.name,
                          imageUrl: row.product.imageUrl,
                          unitPrice: row.product.price,
                          quantity,
                          lineTotal: row.product.price * quantity,
                        },
                      ]}
                    />
                    {shortage !== undefined && (
                      <p role="alert" className="-mt-2 px-4 pb-3 md:px-6">
                        <span className="rounded-sm bg-danger-soft px-2 py-1 text-xs font-bold text-danger">
                          재고 부족 · 남은 수량 {shortage.available}개 ({shortage.requested - shortage.available}개 부족)
                        </span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          <BenefitsSection
            quote={quote}
            benefits={benefits}
            onChange={(next) => {
              setBenefits(next);
              idempotencyKey.current = crypto.randomUUID();
              setPay({ status: "idle" });
            }}
          />
          <section aria-labelledby="pay-title" className="border-t border-line p-4 md:p-6">
            <h2 id="pay-title" className="text-base font-extrabold text-ink">
              결제 수단
            </h2>
            <label className="mt-3 flex items-center gap-3 text-sm">
              <input type="radio" name="payment" defaultChecked className="peer sr-only" />
              <span aria-hidden="true" className="flex size-5.5 items-center justify-center rounded-pill border-2 border-ink">
                <span className="size-2.5 rounded-pill bg-ink" />
              </span>
              <span className="font-bold text-ink">{PAYMENT_METHOD_LABELS.virtual}</span>
              <span className="text-xs-plus text-ink-3">실제 결제는 이뤄지지 않아요</span>
            </label>
          </section>
        </div>
      </div>
      <aside aria-label="결제 금액" className="max-lg:hidden lg:sticky lg:top-6">
        <SummaryCard>
          <BenefitAmountRows quote={quote} />
          {pay.status === "failed" && <PayFailure error={pay.error} />}
          <div className="mt-6">{payButton}</div>
        </SummaryCard>
      </aside>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground p-4 lg:hidden">
        {pay.status === "failed" && <PayFailure error={pay.error} />}
        <div className="flex items-center justify-between text-xs-plus text-ink-2">
          <span>상품 합계 {amounts !== null ? wonText(amounts.subtotal) : "-"}</span>
          <span>배송비 {amounts !== null ? wonText(amounts.shippingFee) : "-"}</span>
          {amounts !== null && amounts.couponDiscount + amounts.usePoints !== 0 && <span>할인 {signedKrw(-(amounts.couponDiscount + amounts.usePoints))}</span>}
        </div>
        <div className="mt-1 mb-3 flex items-center justify-between">
          <span className="text-sm font-bold text-ink">결제 금액</span>
          <span className="text-2xl leading-8 font-extrabold text-ink">{amounts !== null ? wonText(amounts.paidAmount) : "-"}</span>
        </div>
        {payButton}
      </div>
      {adminNotice && (
        <AdminOrderNotice
          next={direct ? "/" : "/cart"}
          onClose={() => {
            setAdminNotice(false);
          }}
        />
      )}
    </div>
  );
}

function PayFailure({ error }: { error: ApiError }) {
  const unsure = error.code === "NETWORK" || error.code === "INTERNAL_ERROR" || error.code === "INVALID_RESPONSE";
  return (
    <div role="alert" className="mt-4 rounded-sm bg-danger-soft p-3 text-xs-plus text-ink-2">
      <p className="font-bold text-danger">결제를 처리하지 못했어요</p>
      <p className="mt-1">{unsure ? "주문이 만들어졌는지 확인하지 못했어요. 다시 시도해도 같은 주문이 두 번 결제되지는 않아요." : error.message}</p>
      {error.fieldErrors !== undefined && (
        <ul className="mt-1 list-disc pl-4">
          {Object.values(error.fieldErrors)
            .flat()
            .map((message) => (
              <li key={message}>{message}</li>
            ))}
        </ul>
      )}
    </div>
  );
}

function ShippingForm({ shipping, onChange }: { shipping: ShippingInfo; onChange: (change: Partial<ShippingInfo>) => void }) {
  const field = "mt-1.5 h-11 w-full rounded-md border border-ink-3 bg-ground px-3 text-sm text-ink";
  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <div>
        <label htmlFor="ship-name" className="text-xs-plus font-bold text-ink">
          받는 사람
        </label>
        <input id="ship-name" className={field} value={shipping.recipientName} onChange={(event) => { onChange({ recipientName: event.target.value }); }} />
      </div>
      <div>
        <label htmlFor="ship-phone" className="text-xs-plus font-bold text-ink">
          휴대폰 번호
        </label>
        <input id="ship-phone" className={field} inputMode="tel" placeholder="010-0000-0000" value={shipping.phone} onChange={(event) => { onChange({ phone: event.target.value }); }} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="ship-address" className="text-xs-plus font-bold text-ink">
          주소
        </label>
        <input id="ship-address" className={field} value={shipping.address} onChange={(event) => { onChange({ address: event.target.value }); }} />
        <p className="mt-1.5 text-xs-plus text-ink-3">고쳐도 이번 주문에만 적용돼요</p>
      </div>
    </div>
  );
}
