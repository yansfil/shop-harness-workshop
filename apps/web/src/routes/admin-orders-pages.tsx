import { streamed } from "../lib/streamed.ts";
import {
  type AdminOrderDetail,
  type AdminOrderRow,
  OrderParamsSchema,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
} from "@grabmarket/contracts";
import { memo, useCallback, useState } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { type ApiError, callApi, isApiError } from "../api/client.ts";
import { Button, LinkButton } from "../components/button.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { OrderSteps } from "../components/order-steps.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { formatFullTime, formatShortTime, krw } from "../lib/format.ts";
import { withRo } from "../lib/korean.ts";
import { NotFoundError } from "../lib/not-found.ts";
import { summarize } from "./orders-pages.tsx";

const FLOW: OrderStatus[] = ["paid", "preparing", "shipping", "delivered"];

function nextOf(status: OrderStatus): OrderStatus | null {
  const index = FLOW.indexOf(status);
  // 취소된 주문처럼 흐름 밖의 상태에는 다음 단계가 없다.
  return index === -1 ? null : (FLOW[index + 1] ?? null);
}

function without<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

// ---- 주문 목록: 전체 주문을 필터·검색·페이지 나누기 없이 한 화면에 ----

export function adminOrdersLoader() {
  return { result: streamed(callApi("listAdminOrders")) };
}

export function AdminOrdersPage() {
  const { result } = useLoaderData<typeof adminOrdersLoader>();
  return (
    <Loaded
      resolve={result}
      failure="주문을 불러오지 못했어요"
      skeleton={
        <>
          <Heading />
          <div aria-hidden="true" className="flex flex-col gap-3 rounded-md border border-line bg-ground p-4">
            {[0, 1, 2, 3].map((index) => (
              <Bone key={index} className="h-10 w-full" />
            ))}
          </div>
        </>
      }
    >
      {({ orders }) => <OrderTable orders={orders} />}
    </Loaded>
  );
}

function Heading({ count }: { count?: number }) {
  return (
    <h1 className="mb-4 flex items-baseline gap-3 text-xl leading-8 font-extrabold text-ink">
      주문
      {count !== undefined && <span className="text-sm leading-5 font-semibold text-ink-2">전체 주문 {count.toLocaleString("ko-KR")}건</span>}
    </h1>
  );
}

const th = "sticky top-0 bg-ground font-normal";

function OrderTable({ orders }: { orders: AdminOrderRow[] }) {
  const [statuses, setStatuses] = useState<Record<number, OrderStatus>>({});
  const [busy, setBusy] = useState<ReadonlySet<number>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<number>>(new Set());

  const advance = useCallback((id: number, to: OrderStatus) => {
    setBusy((current) => new Set(current).add(id));
    setFailed((current) => without(current, id));
    callApi("changeOrderStatus", { params: { orderId: id }, body: { status: to } }).then(
      ({ order }) => {
        setStatuses((current) => ({ ...current, [id]: order.status }));
        setBusy((current) => without(current, id));
      },
      (error: unknown) => {
        console.warn("주문 상태를 바꾸지 못했습니다", error);
        setBusy((current) => without(current, id));
        setFailed((current) => new Set(current).add(id));
      },
    );
  }, []);

  if (orders.length === 0) {
    return (
      <>
        <Heading count={0} />
        <div className="rounded-md border border-line bg-ground">
          <EmptyState title="아직 주문이 없어요" hint="고객이 주문하면 여기에 나타나요" />
        </div>
      </>
    );
  }

  return (
    <>
      <Heading count={orders.length} />
      <div className="overflow-x-auto rounded-md border border-line bg-ground">
        <table className="w-full min-w-225 border-collapse text-left text-sm">
          <thead>
            <tr className="h-10 text-xs-plus text-ink-3">
              <th scope="col" className={`${th} px-6`}>
                주문번호
              </th>
              <th scope="col" className={`${th} px-3`}>
                고객
              </th>
              <th scope="col" className={`${th} px-3`}>
                상품 요약
              </th>
              <th scope="col" className={`${th} px-3 text-right`}>
                금액
              </th>
              <th scope="col" className={`${th} px-3`}>
                주문 시각
              </th>
              <th scope="col" className={`${th} px-3`}>
                상태
              </th>
              <th scope="col" className={`${th} px-6 text-right`}>
                다음 단계
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                status={statuses[order.id] ?? order.status}
                busy={busy.has(order.id)}
                failed={failed.has(order.id)}
                onAdvance={advance}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

const OrderRow = memo(function OrderRow({
  order,
  status,
  busy,
  failed,
  onAdvance,
}: {
  order: AdminOrderRow;
  status: OrderStatus;
  busy: boolean;
  failed: boolean;
  onAdvance: (id: number, to: OrderStatus) => void;
}) {
  const next = nextOf(status);
  return (
    <tr className="h-12 border-t border-line">
      <td className="px-6 font-extrabold text-ink">
        <Link to={`/admin/orders/${order.id}`} className="underline-offset-2 hover:underline">
          {order.orderNumber}
        </Link>
      </td>
      <td className="px-3 text-ink-2">{order.customerName}</td>
      <td className="max-w-80 truncate px-3 text-ink">{summarize(order)}</td>
      <td className="px-3 text-right font-extrabold text-ink">{krw(order.total)}</td>
      <td className="px-3 text-ink-2">{formatShortTime(order.createdAt)}</td>
      <td className="px-3">
        <StatusBadge status={status} />
      </td>
      <td className="px-6 text-right">
        {next !== null && (
          <span className="inline-flex items-center gap-2">
            {failed && <span className="text-xs font-semibold text-danger">변경하지 못했어요</span>}
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              aria-label={`${order.orderNumber} ${withRo(ORDER_STATUS_LABELS[next])} 변경`}
              onClick={() => {
                onAdvance(order.id, next);
              }}
            >
              {busy ? "변경 중" : failed ? "다시 시도" : `${withRo(ORDER_STATUS_LABELS[next])} 변경`}
            </Button>
          </span>
        )}
      </td>
    </tr>
  );
});

// ---- 주문 상세와 다음 단계 ----

export function adminOrderLoader({ params }: LoaderFunctionArgs) {
  const parsed = OrderParamsSchema.safeParse(params);
  if (!parsed.success) throw new NotFoundError("찾을 수 없는 주문입니다");
  return { result: streamed(callApi("getAdminOrder", { params: { orderId: parsed.data.orderId } })) };
}

export function AdminOrderPage() {
  const { result } = useLoaderData<typeof adminOrderLoader>();
  return (
    <Loaded
      resolve={result}
      failure="주문을 불러오지 못했어요"
      skeleton={
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Bone className="h-9 w-64" />
          <Bone className="h-60 w-full" />
        </div>
      }
      notFound={
        <EmptyState title="주문을 찾을 수 없어요" hint="주문번호를 다시 확인해 주세요">
          <LinkButton to="/admin/orders" size="lg">
            주문 목록
          </LinkButton>
        </EmptyState>
      }
    >
      {({ order }) => <AdminOrderView initial={order} />}
    </Loaded>
  );
}

function AdminOrderView({ initial }: { initial: AdminOrderDetail }) {
  const [order, setOrder] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const next = order.nextStatus;

  async function advance() {
    if (next === null) return;
    setPending(true);
    setError(null);
    try {
      const response = await callApi("changeOrderStatus", { params: { orderId: order.id }, body: { status: next } });
      setOrder(response.order);
    } catch (caught) {
      if (!isApiError(caught)) throw caught;
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <nav aria-label="현재 위치" className="flex items-center gap-1 text-xs-plus text-ink-2">
        <Link to="/admin/orders" className="font-semibold text-ink">
          주문
        </Link>
        <Icon name="chevronRight" className="size-4" />
        <span>{order.orderNumber}</span>
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl leading-9 font-extrabold text-ink">{order.orderNumber}</h1>
        <StatusBadge status={order.status} />
        <span className="ml-auto text-sm text-ink-2">{formatFullTime(order.createdAt)} 주문</span>
      </div>
      <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start">
        <div className="rounded-md border border-line bg-ground">
          <section aria-labelledby="admin-items">
            <h2 id="admin-items" className="px-6 pt-5 text-sm font-extrabold text-ink">
              주문 상품
            </h2>
            <OrderLines items={order.items} size="sm" />
          </section>
          <dl className="flex flex-col gap-2 border-t border-line px-6 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-3">상품 합계</dt>
              <dd className="font-semibold text-ink">{krw(order.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-3">배송비</dt>
              <dd className="font-semibold text-ink">{krw(order.shippingFee)}</dd>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <dt className="font-bold text-ink">결제 금액</dt>
              <dd className="text-xl font-extrabold text-ink">{krw(order.total)}</dd>
            </div>
          </dl>
          <section aria-labelledby="admin-ship" className="border-t border-line px-6 py-5">
            <h2 id="admin-ship" className="text-sm font-extrabold text-ink">
              주문자·배송
            </h2>
            <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-y-2 text-sm">
              <dt className="text-ink-3">고객</dt>
              <dd className="font-semibold text-ink">
                {order.customer.name} <span className="font-normal text-ink-3">{order.customer.email}</span>
              </dd>
              <dt className="text-ink-3">받는 사람</dt>
              <dd className="font-semibold text-ink">
                {order.shipping.recipientName} · {order.shipping.phone}
              </dd>
              <dt className="text-ink-3">배송지</dt>
              <dd className="font-semibold text-ink">{order.shipping.address}</dd>
              <dt className="text-ink-3">결제 수단</dt>
              <dd className="font-semibold text-ink">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</dd>
            </dl>
          </section>
        </div>
        <aside aria-label="주문 상태" className="rounded-md border border-line bg-ground p-6">
          <h2 className="text-sm font-extrabold text-ink">주문 상태</h2>
          <div className="mt-4">
            <OrderSteps status={order.status} />
          </div>
          {next !== null ? (
            <>
              <Button size="lg" className="mt-6 w-full" disabled={pending} onClick={() => void advance()}>
                {pending ? "변경하는 중" : `${withRo(ORDER_STATUS_LABELS[next])} 변경`}
              </Button>
              <p className="mt-3 text-xs-plus text-ink-3">상태는 다음 단계로만 바꿀 수 있어요</p>
            </>
          ) : (
            <p className="mt-6 text-sm font-semibold text-ink-2">{order.status === "cancelled" ? "고객이 취소한 주문이에요" : "배송이 완료된 주문이에요"}</p>
          )}
          {error !== null && (
            <p role="alert" className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-xs-plus font-semibold text-danger">
              {error.message}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
