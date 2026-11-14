import { type MyOrderDetail, type OrderDetail, type OrderSummary, OrderParamsSchema, PAYMENT_METHOD_LABELS } from "@grabmarket/contracts";
import { useEffect, useState } from "react";
import { Form, Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { streamed } from "../lib/streamed.ts";
import { callApi, isApiError } from "../api/client.ts";
import { Button, LinkButton } from "../components/button.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { OrderSteps } from "../components/order-steps.tsx";
import { Page } from "../components/page.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { krw } from "../lib/format.ts";
import { elapsedOrderLabel, formatShortTime } from "../lib/format.ts";
import { NotFoundError } from "../lib/not-found.ts";

export function summarize(order: Pick<OrderSummary, "firstItemName" | "itemCount">): string {
  return order.itemCount > 1 ? `${order.firstItemName} 외 ${order.itemCount - 1}건` : order.firstItemName;
}

// ---- 내 주문 목록 ----

export function myOrdersLoader() {
  return { result: streamed(callApi("listMyOrders")) };
}

export function MyOrdersPage() {
  const { result } = useLoaderData<typeof myOrdersLoader>();
  return (
    <Page>
      <Loaded
        resolve={result}
        failure="주문 내역을 불러오지 못했어요"
        skeleton={
          <>
            <Heading />
            <div aria-hidden="true" className="flex flex-col gap-3 rounded-md border border-line bg-ground p-4">
              <Bone className="h-10 w-full" />
              <Bone className="h-10 w-full" />
              <Bone className="h-10 w-full" />
            </div>
          </>
        }
      >
        {({ orders }) => (
          <>
            <Heading count={orders.length} />
            {orders.length === 0 ? (
              <div className="rounded-md border border-line bg-ground">
                <EmptyState title="아직 주문한 상품이 없어요" hint="마음에 드는 상품을 담아 주문해 보세요">
                  <LinkButton to="/" size="lg">
                    쇼핑하러 가기
                  </LinkButton>
                </EmptyState>
              </div>
            ) : (
              <OrderList orders={orders} />
            )}
          </>
        )}
      </Loaded>
      <MobileFooter />
    </Page>
  );
}

/** 모바일 머리에는 맨 위 메뉴 줄이 없어서 내 주문 맨 아래에 고객센터와 로그아웃을 둔다(모바일만). */
function MobileFooter() {
  const item = "flex h-9 items-center px-3.5 text-sm font-semibold text-ink-2";
  return (
    <nav aria-label="내 주문 아래 메뉴" className="mt-6 flex items-center justify-center md:hidden">
      <Link to="/help" className={item}>
        고객센터
      </Link>
      <span aria-hidden="true" className="h-3 w-px bg-line" />
      <Form method="post" action="/logout">
        <button type="submit" className={item}>
          로그아웃
        </button>
      </Form>
    </nav>
  );
}

function Heading({ count }: { count?: number }) {
  return (
    <h1 className="mb-4 flex items-baseline gap-2 text-xl leading-8 font-extrabold text-ink">
      내 주문
      {count !== undefined && <span className="text-sm leading-5 font-semibold text-ink-2">전체 {count}건</span>}
    </h1>
  );
}

const listGrid = "md:grid md:grid-cols-[8rem_9rem_minmax(0,1fr)_8rem_6rem_2rem] md:items-center md:gap-x-4";

function OrderList({ orders }: { orders: OrderSummary[] }) {
  return (
    <div className="rounded-md border border-line bg-ground">
      <div className={`${listGrid} hidden h-10 border-b border-line px-6 text-xs-plus text-ink-3 md:grid`}>
        <span>주문번호</span>
        <span>주문 시각</span>
        <span>상품 요약</span>
        <span className="text-right">결제 금액</span>
        <span>상태</span>
        <span />
      </div>
      <ul>
        {orders.map((order) => (
          <li key={order.id} className="border-b border-line last:border-b-0">
            <Link to={`/orders/${order.id}`} className={`${listGrid} flex flex-wrap items-center justify-between gap-y-1 px-4 py-4 md:h-14 md:px-6 md:py-0`}>
              <span className="text-sm font-extrabold text-ink md:text-sm">{order.orderNumber}</span>
              <span className="order-last w-full text-xs-plus text-ink-3 md:order-none md:w-auto md:text-sm">{formatShortTime(order.createdAt)}</span>
              <span className="order-last w-full truncate text-sm text-ink md:order-none md:w-auto">{summarize(order)}</span>
              <span className="text-sm font-extrabold text-ink md:text-right">{krw(order.total)}</span>
              <span className="max-md:order-2">
                <StatusBadge status={order.status} />
              </span>
              <Icon name="chevronRight" className="size-5 text-ink-2 max-md:hidden" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- 내 주문 상세·주문 완료 ----

export function myOrderLoader({ params }: LoaderFunctionArgs) {
  const parsed = OrderParamsSchema.safeParse(params);
  if (!parsed.success) throw new NotFoundError("찾을 수 없는 주문입니다");
  return { result: streamed(callApi("getMyOrder", { params: { orderId: parsed.data.orderId } })) };
}

const orderNotFound = (
  <EmptyState title="주문을 찾을 수 없어요" hint="주문번호를 다시 확인하거나 내 주문에서 찾아보세요">
    <LinkButton to="/orders" size="lg" className="min-w-60">
      내 주문 보기
    </LinkButton>
  </EmptyState>
);

const detailSkeleton = (
  <div aria-hidden="true" className="flex flex-col gap-3">
    <Bone className="h-9 w-64" />
    <Bone className="h-24 w-full" />
    <Bone className="h-40 w-full" />
  </div>
);

function MethodRows({ order }: { order: OrderDetail }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="shrink-0 text-ink-3">결제 수단</dt>
        <dd className="text-right font-semibold text-ink">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="shrink-0 text-ink-3">배송지</dt>
        <dd className="text-right font-semibold text-ink">{order.shipping.address}</dd>
      </div>
    </dl>
  );
}

export function MyOrderPage() {
  const { result } = useLoaderData<typeof myOrderLoader>();
  return (
    <Page>
      <Loaded resolve={result} failure="주문을 불러오지 못했어요" skeleton={detailSkeleton} notFound={orderNotFound}>
        {({ order }) => <MyOrderView initial={order} />}
      </Loaded>
    </Page>
  );
}

function MyOrderView({ initial }: { initial: MyOrderDetail }) {
  const [order, setOrder] = useState<OrderDetail>(initial);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelledNow, setCancelledNow] = useState(false);

  async function cancel() {
    setPending(true);
    setError(null);
    try {
      const response = await callApi("cancelMyOrder", { params: { orderId: order.id } });
      setOrder(response.order);
      setCancelledNow(true);
    } catch (caught) {
      if (!isApiError(caught)) throw caught;
      setError(caught.message);
      // 그 사이 주문 상태가 바뀌었을 수 있으니 서버의 주문을 다시 읽어 보인다.
      if (caught.code === "ORDER_NOT_CANCELLABLE") {
        await callApi("getMyOrder", { params: { orderId: order.id } }).then(
          (fresh) => {
            setOrder(fresh.order);
          },
          () => undefined,
        );
      }
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Link to="/orders" className="inline-flex items-center gap-1 text-xs-plus font-semibold text-ink-2">
        <Icon name="chevronLeft" className="size-4" />내 주문
      </Link>
      <h1 className="mt-3 flex flex-wrap items-center gap-3 text-xl leading-8 font-extrabold text-ink md:text-2xl">
        주문 {order.orderNumber}
        <StatusBadge status={order.status} />
        <span className="text-sm leading-5 font-medium text-ink-3">{formatShortTime(order.createdAt)} · {elapsedOrderLabel(initial.elapsedDays)}</span>
      </h1>
      <div className="mt-4 rounded-md border border-line bg-ground px-4 py-5 md:px-6 md:py-6">
        <div className="mx-auto max-w-190">
          <OrderSteps status={order.status} />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start lg:gap-3">
        <section aria-labelledby="order-items" className="rounded-md border border-line bg-ground">
          <h2 id="order-items" className="flex h-12 items-center border-b border-line px-4 text-base font-extrabold text-ink md:px-6">
            주문 상품
          </h2>
          <OrderLines items={order.items} />
        </section>
        <aside aria-label="결제 정보" className="rounded-md border border-line bg-ground p-6">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-3">상품 합계</dt>
              <dd className="font-semibold text-ink">{krw(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-3">배송비</dt>
              <dd className="font-semibold text-ink">{krw(order.shippingFee)}</dd>
            </div>
            <div className="mb-3 flex items-center justify-between border-t border-line pt-4">
              <dt className="font-bold text-ink">결제 금액</dt>
              <dd className="text-2xl leading-9 font-extrabold text-ink">{krw(order.total)}</dd>
            </div>
          </dl>
          <MethodRows order={order} />
          {order.cancellable && (
            <Button
              variant="secondary"
              size="lg"
              className="mt-6 w-full"
              onClick={() => {
                setConfirming(true);
              }}
            >
              주문 취소
            </Button>
          )}
          {cancelledNow && (
            <p role="status" className="mt-4 rounded-sm bg-soldout-bg px-3 py-2 text-xs-plus font-semibold text-soldout-text">
              주문을 취소했어요. 교육용 가상 결제라 실제 환불은 없어요.
            </p>
          )}
          {error !== null && (
            <p role="alert" className="mt-4 rounded-sm bg-danger-soft px-3 py-2 text-xs-plus font-semibold text-danger">
              {error}
            </p>
          )}
        </aside>
      </div>
      {confirming && (
        <CancelConfirm
          pending={pending}
          onClose={() => {
            setConfirming(false);
          }}
          onConfirm={() => void cancel()}
        />
      )}
    </>
  );
}

/** 취소는 되돌릴 수 없으므로 한 번 더 묻는다. */
function CancelConfirm({ pending, onClose, onConfirm }: { pending: boolean; onClose: () => void; onConfirm: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("keydown", close);
    };
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="cancel-title" className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div className="relative w-full max-w-100 rounded-md bg-ground p-6">
        <h2 id="cancel-title" className="text-lg font-extrabold text-ink">
          주문을 취소할까요?
        </h2>
        <p className="mt-2 text-sm text-ink-2">취소하면 되돌릴 수 없어요. 주문한 상품은 재고로 돌아가요.</p>
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" autoFocus disabled={pending} onClick={onClose}>
            돌아가기
          </Button>
          <Button size="lg" className="flex-1" disabled={pending} onClick={onConfirm}>
            {pending ? "취소하는 중" : "주문 취소하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function OrderCompletePage() {
  const { result } = useLoaderData<typeof myOrderLoader>();
  return (
    <Page>
      <Loaded resolve={result} failure="주문을 불러오지 못했어요" skeleton={detailSkeleton} notFound={orderNotFound}>
        {({ order }) => (
          <div className="mx-auto max-w-180">
            <div className="flex flex-col items-center text-center">
              <span className="flex size-14 items-center justify-center rounded-pill bg-accent text-ink">
                <Icon name="check" className="size-8" />
              </span>
              <h1 className="mt-5 text-3xl leading-9 font-extrabold text-ink">주문이 완료됐어요</h1>
              <p className="mt-3 flex items-center gap-2 text-base">
                <b className="font-extrabold text-ink">{order.orderNumber}</b>
                <span className="text-ink-3">{formatShortTime(order.createdAt)}</span>
                <StatusBadge status={order.status} />
              </p>
            </div>
            <div className="mt-8 rounded-md border border-line bg-ground">
              <OrderLines items={order.items} />
              <dl className="border-t border-line text-sm">
                <div className="flex h-11 items-center justify-between border-b border-line px-4 md:px-6">
                  <dt className="text-ink-3">배송지</dt>
                  <dd className="font-semibold text-ink">{order.shipping.address}</dd>
                </div>
                <div className="flex h-11 items-center justify-between border-b border-line px-4 md:px-6">
                  <dt className="text-ink-3">결제 수단</dt>
                  <dd className="font-semibold text-ink">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd>
                </div>
                <div className="flex h-11 items-center justify-between border-b border-line px-4 md:px-6">
                  <dt className="text-ink-3">상품 합계 + 배송비</dt>
                  <dd className="font-semibold text-ink">
                    {krw(order.subtotal)} + {krw(order.shippingFee)}
                  </dd>
                </div>
                <div className="flex h-16 items-center justify-between px-4 md:px-6">
                  <dt className="font-bold text-ink">결제 금액</dt>
                  <dd className="text-xl font-extrabold text-ink">{krw(order.total)}</dd>
                </div>
              </dl>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <LinkButton to="/orders" size="lg">
                내 주문 보기
              </LinkButton>
              <LinkButton to="/" variant="secondary" size="lg">
                쇼핑 계속하기
              </LinkButton>
            </div>
          </div>
        )}
      </Loaded>
    </Page>
  );
}

