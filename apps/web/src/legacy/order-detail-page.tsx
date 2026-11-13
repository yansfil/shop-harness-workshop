// 내 주문 상세 (예전 주문 상세 API: 결제 내역·배송·취소·반품 정보를 함께 받는다)
import { OrderParamsSchema, PAYMENT_METHOD_LABELS } from "@grabmarket/contracts";
import { useState } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData, useRevalidator } from "react-router";
import { callApi } from "../api/client.ts";
import { Button, LinkButton } from "../components/button.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { OrderSteps } from "../components/order-steps.tsx";
import { Page } from "../components/page.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { formatShortTime } from "../lib/format.ts";
import { NotFoundError } from "../lib/not-found.ts";
import { streamed } from "../lib/streamed.ts";
import { errorText, fieldError, legacyGet, legacyPut } from "./legacyApi.ts";
import { pointText, signedKrw, wonText } from "./money.ts";
import { ConfirmDialog, FieldMessage, Notice, Tag, fieldClass, labelClass } from "./ui.tsx";

export function orderDetailLoader({ params }: LoaderFunctionArgs) {
  const parsed = OrderParamsSchema.safeParse(params);
  if (!parsed.success) throw new NotFoundError("찾을 수 없는 주문입니다");
  return { result: streamed(legacyGet("/api/order-extras/" + parsed.data.orderId)) };
}

const CANCEL_REASONS = ["단순 변심", "주문을 잘못했어요", "배송이 너무 늦어요", "다른 상품으로 다시 주문할게요"];

const notFound = (
  <EmptyState title="주문을 찾을 수 없어요" hint="주문번호를 다시 확인하거나 내 주문에서 찾아보세요">
    <LinkButton to="/orders" size="lg" className="min-w-60">
      내 주문 보기
    </LinkButton>
  </EmptyState>
);

export function OrderDetailPage() {
  const { result } = useLoaderData<typeof orderDetailLoader>();
  return (
    <Page>
      <Loaded
        resolve={result}
        failure="주문을 불러오지 못했어요"
        notFound={notFound}
        skeleton={
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Bone className="h-9 w-64" />
            <Bone className="h-24 w-full" />
            <Bone className="h-40 w-full" />
          </div>
        }
      >
        {(data: any) => <OrderDetailView data={data} />}
      </Loaded>
    </Page>
  );
}

function OrderDetailView({ data }: { data: any }) {
  const order = data.order;
  const pay = data.payment;
  const revalidator = useRevalidator();
  const [dialog, setDialog] = useState<"cancel" | "address" | null>(null);
  const [notice, setNotice] = useState<any>(null);
  const changeable = order.status === "paid" || order.status === "preparing";

  return (
    <>
      <Link to="/orders" className="inline-flex items-center gap-1 text-xs-plus font-semibold text-ink-2">
        <Icon name="chevronLeft" className="size-4" />내 주문
      </Link>
      <h1 className="mt-3 flex flex-wrap items-center gap-3 text-xl leading-8 font-extrabold text-ink md:text-2xl">
        주문 {order.orderNumber}
        <StatusBadge status={order.status} />
        <span className="text-sm leading-5 font-medium text-ink-3">{formatShortTime(order.createdAt)} 주문</span>
      </h1>
      {notice && (
        <div className="mt-3">
          <Notice notice={notice} />
        </div>
      )}
      <div className="mt-4 rounded-md border border-line bg-ground px-4 py-5 md:px-6 md:py-6">
        <div className="mx-auto max-w-190">
          <OrderSteps status={order.status} />
        </div>
        {data.shipment && (
          <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs-plus text-ink-2">
            {data.shipment.courierName} {data.shipment.trackingNo}
            <Link to={"/orders/" + order.id + "/tracking"} className="font-bold text-ink underline underline-offset-2">
              배송 조회
            </Link>
          </p>
        )}
        {order.status === "cancelled" && data.cancelledAtText && <p className="mt-2 text-center text-xs-plus text-ink-3">{data.cancelledAtText} 취소</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        <ActionWithReason
          label="주문 취소"
          enabled={data.cancellable}
          reason={data.cancelBlockedReason}
          onClick={() => {
            setDialog("cancel");
          }}
        />
        <ActionWithReason label="반품·교환 신청" enabled={data.returnable} reason={data.returnBlockedReason} to={"/returns/new?orderId=" + order.id} />
        {changeable && !data.shipment && (
          <Button
            variant="secondary"
            size="sm"
            className="h-10"
            onClick={() => {
              setDialog("address");
            }}
          >
            배송지 변경
          </Button>
        )}
        {data.shipment && (
          <LinkButton to={"/orders/" + order.id + "/tracking"} variant="secondary" size="sm" className="h-10">
            배송 조회
          </LinkButton>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-3">
        <div className="flex flex-col gap-3">
          <section aria-labelledby="order-items" className="rounded-md border border-line bg-ground">
            <h2 id="order-items" className="flex h-12 items-center border-b border-line px-4 text-base font-extrabold text-ink md:px-6">
              주문 상품
            </h2>
            <OrderLines items={order.items} />
          </section>
          {data.returns && data.returns.length > 0 && (
            <section className="rounded-md border border-line bg-ground">
              <h2 className="flex h-12 items-center border-b border-line px-4 text-base font-extrabold text-ink md:px-6">반품·교환</h2>
              <ul>
                {data.returns.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between border-b border-line px-4 py-3 text-sm last:border-b-0 md:px-6">
                    <span className="flex items-center gap-2">
                      <b className="font-bold text-ink">{r.requestNo}</b>
                      {r.kindText}
                    </span>
                    <span className="flex items-center gap-3">
                      {r.refundAmount > 0 && <span className="text-ink-2">{wonText(r.refundAmount)}</span>}
                      <Tag tone={r.state === "approved" ? "green" : r.state === "rejected" ? "red" : r.state === "withdrawn" ? "muted" : "yellow"}>{r.stateText}</Tag>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside aria-label="결제 정보" className="rounded-md border border-line bg-ground p-6">
          <PaymentRows order={order} pay={pay} />
          <dl className="mt-4 flex flex-col gap-3 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-ink-3">결제 수단</dt>
              <dd className="text-right font-semibold text-ink">{(PAYMENT_METHOD_LABELS as any)[order.paymentMethod]}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-ink-3">받는 분</dt>
              <dd className="text-right font-semibold text-ink">
                {order.shipping.recipientName} · {order.shipping.phone}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-ink-3">배송지</dt>
              <dd className="text-right font-semibold text-ink">{order.shipping.address}</dd>
            </div>
          </dl>
        </aside>
      </div>

      {dialog === "cancel" && (
        <CancelDialog
          order={order}
          pay={pay}
          onClose={() => {
            setDialog(null);
          }}
          onDone={() => {
            setDialog(null);
            setNotice({ kind: "ok", text: "주문을 취소했어요." });
            void revalidator.revalidate();
          }}
        />
      )}
      {dialog === "address" && (
        <AddressDialog
          order={order}
          onClose={() => {
            setDialog(null);
          }}
          onDone={() => {
            setDialog(null);
            setNotice({ kind: "ok", text: "배송지를 바꿨어요." });
            void revalidator.revalidate();
          }}
        />
      )}
    </>
  );
}

/** 조건 밖이면 버튼을 끄고 이유를 곁에 보인다 */
function ActionWithReason({ label, enabled, reason, onClick, to }: { label: string; enabled: boolean; reason: string | null; onClick?: () => void; to?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {to !== undefined && enabled ? (
        <LinkButton to={to} variant="secondary" size="sm" className="h-10">
          {label}
        </LinkButton>
      ) : (
        <Button variant="secondary" size="sm" className="h-10" disabled={!enabled} onClick={onClick}>
          {label}
        </Button>
      )}
      {!enabled && reason && <span className="max-w-60 text-xs text-ink-3">{reason}</span>}
    </div>
  );
}

function PaymentRows({ order, pay }: { order: any; pay: any }) {
  const coupon = pay ? pay.couponDiscount : 0;
  const points = pay ? pay.pointUsed : 0;
  const paid = pay ? pay.paidAmount : order.total;
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <div className="flex justify-between">
        <dt className="text-ink-3">상품 합계</dt>
        <dd className="font-semibold text-ink">{wonText(order.subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-ink-3">배송비</dt>
        <dd className="font-semibold text-ink">{wonText(order.shippingFee)}</dd>
      </div>
      {pay && pay.couponCode && (
        <div className="flex justify-between gap-3">
          <dt className="text-ink-3">쿠폰 할인 · {pay.couponName}</dt>
          <dd className="shrink-0 font-semibold text-ink">{signedKrw(-coupon)}</dd>
        </div>
      )}
      {points > 0 && (
        <div className="flex justify-between">
          <dt className="text-ink-3">포인트 사용</dt>
          <dd className="font-semibold text-ink">{signedKrw(-points)}</dd>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-line pt-4">
        <dt className="font-bold text-ink">결제 금액</dt>
        <dd className="text-2xl leading-9 font-extrabold text-ink">{wonText(paid)}</dd>
      </div>
      {pay && pay.rewardPoints > 0 && (
        <div className="flex justify-between">
          <dt className="text-ink-3">적립 포인트</dt>
          <dd className="font-semibold text-ink">{pointText(pay.rewardPoints)}</dd>
        </div>
      )}
      {pay && pay.refundedAmount > 0 && (
        <div className="flex justify-between">
          <dt className="text-ink-3">{pay.refundStatus === "full" ? "전액 환불" : "부분 환불"}</dt>
          <dd className="font-semibold text-danger">{wonText(pay.refundedAmount)}</dd>
        </div>
      )}
    </dl>
  );
}

function CancelDialog({ order, pay, onClose, onDone }: { order: any; pay: any; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refund = pay ? pay.paidAmount - pay.refundedAmount : order.total;
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await callApi("cancelOrder", { params: { orderId: order.id }, body: { reason: reason } });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <ConfirmDialog
      title="주문을 취소할까요?"
      body={
        <ul className="flex flex-col gap-1">
          <li>결제 금액 {wonText(refund)}을 돌려 드려요.</li>
          {pay && pay.couponCode && <li>쓴 쿠폰은 다시 쓸 수 있게 돌려 드려요.</li>}
          {pay && pay.pointUsed > 0 && <li>쓴 포인트 {pointText(pay.pointUsed)}를 돌려 드려요.</li>}
          <li>취소하면 되돌릴 수 없어요.</li>
        </ul>
      }
      confirmLabel="주문 취소"
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={() => void confirm()}
    >
      <label className="mt-4 flex flex-col gap-1">
        <span className={labelClass}>취소 이유</span>
        <select
          className={fieldClass}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
          }}
        >
          {CANCEL_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
    </ConfirmDialog>
  );
}

function AddressDialog({ order, onClose, onDone }: { order: any; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ recipientName: order.shipping.recipientName, phone: order.shipping.phone, address: order.shipping.address });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await legacyPut("/api/orders/" + order.id + "/shipping-address", form);
      onDone();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  const input = (name: "recipientName" | "phone" | "address", label: string) => (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <input
        className={fieldClass}
        value={form[name]}
        onChange={(event) => {
          setForm({ ...form, [name]: event.target.value });
        }}
      />
      <FieldMessage text={fieldError(error, name)} />
    </label>
  );
  return (
    <ConfirmDialog
      title="배송지 변경"
      body="송장이 나가기 전까지만 바꿀 수 있어요."
      confirmLabel="바꾸기"
      busy={busy}
      error={error && !fieldError(error, "recipientName") && !fieldError(error, "phone") && !fieldError(error, "address") ? errorText(error) : null}
      onClose={onClose}
      onConfirm={() => void confirm()}
    >
      <div className="mt-4 flex flex-col gap-3">
        {input("recipientName", "받는 분")}
        {input("phone", "휴대폰 번호")}
        {input("address", "주소")}
      </div>
    </ConfirmDialog>
  );
}
