import { type OrderDetail, type OrderSummary, OrderParamsSchema, PAYMENT_METHOD_LABELS } from "@grabmarket/contracts";
import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { callApi } from "../api/client.ts";
import { LinkButton } from "../components/button.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { OrderSteps } from "../components/order-steps.tsx";
import { Page } from "../components/page.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { krw } from "../lib/format.ts";
import { formatShortTime } from "../lib/format.ts";
import { NotFoundError } from "../lib/not-found.ts";

export function summarize(order: Pick<OrderSummary, "firstItemName" | "itemCount">): string {
  return order.itemCount > 1 ? `${order.firstItemName} 외 ${order.itemCount - 1}건` : order.firstItemName;
}

// ---- 내 주문 목록 ----

export function myOrdersLoader() {
  return { result: callApi("listMyOrders") };
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
    </Page>
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
  return { result: callApi("getMyOrder", { params: { orderId: parsed.data.orderId } }) };
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
        {({ order }) => (
          <>
            <Link to="/orders" className="inline-flex items-center gap-1 text-xs-plus font-semibold text-ink-2">
              <Icon name="chevronLeft" className="size-4" />내 주문
            </Link>
            <h1 className="mt-3 flex flex-wrap items-center gap-3 text-xl leading-8 font-extrabold text-ink md:text-2xl">
              주문 {order.orderNumber}
              <StatusBadge status={order.status} />
              <span className="text-sm leading-5 font-medium text-ink-3">{formatShortTime(order.createdAt)} 주문</span>
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
              </aside>
            </div>
          </>
        )}
      </Loaded>
    </Page>
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

