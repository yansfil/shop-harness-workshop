import { streamed } from "../lib/streamed.ts";
import {
  type AdminOrderDetail,
  type AdminOrderListResponse,
  type AdminOrderRow,
  OrderParamsSchema,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
} from "@grabmarket/contracts";
import { memo, useCallback, useState } from "react";
import { Form, Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { type ApiError, callApi, isApiError } from "../api/client.ts";
import { Button, LinkButton } from "../components/button.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { OrderSteps } from "../components/order-steps.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { type AdminOrderSearch, adminOrdersPath, parseAdminOrderSearch } from "../lib/admin-order-query.ts";
import { formatFullTime, formatShortTime, krw } from "../lib/format.ts";
import { withRo } from "../lib/korean.ts";
import { NotFoundError } from "../lib/not-found.ts";
import { pageWindow } from "../lib/pagination.ts";
import { summarize } from "./orders-pages.tsx";

const FLOW: OrderStatus[] = ["paid", "preparing", "shipping", "delivered"];

function nextOf(status: OrderStatus): OrderStatus | null {
  return FLOW[FLOW.indexOf(status) + 1] ?? null;
}

function without<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

// ---- 주문 목록: 상태 칩과 검색, 번호 방식 페이지 나누기 ----

export function adminOrdersLoader({ request }: LoaderFunctionArgs) {
  const search = parseAdminOrderSearch(new URL(request.url).searchParams);
  if (search === null) throw new NotFoundError("주문 조회 조건이 올바르지 않습니다");
  return { search, result: streamed(callApi("listAdminOrders", { query: { status: search.status, q: search.q, page: search.page } })) };
}

export function AdminOrdersPage() {
  const { search, result } = useLoaderData<typeof adminOrdersLoader>();
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
      {(data) => <OrderList search={search} data={data} />}
    </Loaded>
  );
}

function Heading({ label, count }: { label?: string; count?: number }) {
  return (
    <h1 className="mb-4 flex items-baseline gap-3 text-xl leading-8 font-extrabold text-ink">
      주문
      {count !== undefined && label !== undefined && (
        <span className="text-sm leading-5 font-semibold text-ink-2">
          {label} {count.toLocaleString("ko-KR")}건
        </span>
      )}
    </h1>
  );
}

const STATUS_CHIPS: { status: OrderStatus | undefined; label: string; count: keyof AdminOrderListResponse["statusCounts"] }[] = [
  { status: undefined, label: "전체", count: "all" },
  { status: "paid", label: ORDER_STATUS_LABELS.paid, count: "paid" },
  { status: "preparing", label: ORDER_STATUS_LABELS.preparing, count: "preparing" },
  { status: "shipping", label: ORDER_STATUS_LABELS.shipping, count: "shipping" },
  { status: "delivered", label: ORDER_STATUS_LABELS.delivered, count: "delivered" },
];

function OrderList({ search, data }: { search: AdminOrderSearch; data: AdminOrderListResponse }) {
  const filtered = search.status !== undefined || search.q !== undefined;
  return (
    <>
      <Heading label={search.status === undefined ? "전체" : ORDER_STATUS_LABELS[search.status]} count={data.total} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="상태" className="flex flex-wrap gap-2">
          {STATUS_CHIPS.map((chip) => {
            const selected = chip.status === search.status;
            return (
              <Link
                key={chip.label}
                to={adminOrdersPath({ ...search, status: chip.status, page: 1 })}
                aria-current={selected ? "true" : undefined}
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${selected ? "border-ink bg-ink text-on-dark" : "border-line bg-ground text-ink-2"}`}
              >
                {chip.label}
                <b className={`font-bold tabular-nums ${selected ? "text-on-dark" : "text-ink-3"}`}>{data.statusCounts[chip.count].toLocaleString("ko-KR")}</b>
              </Link>
            );
          })}
        </nav>
        <OrderSearch search={search} />
      </div>
      {data.total === 0 ? (
        <div className="rounded-md border border-line bg-ground">
          {filtered ? (
            <EmptyState title="조건에 맞는 주문이 없어요" hint="상태나 검색어를 바꿔 보세요">
              <LinkButton to="/admin/orders" variant="secondary">
                조건 지우기
              </LinkButton>
            </EmptyState>
          ) : (
            <EmptyState title="아직 주문이 없어요" hint="고객이 주문하면 여기에 나타나요" />
          )}
        </div>
      ) : data.orders.length === 0 ? (
        <div className="rounded-md border border-line bg-ground">
          <EmptyState title="이 페이지에는 주문이 없어요" hint={`전체 ${data.pageCount.toLocaleString("ko-KR")}쪽까지 있어요`}>
            <LinkButton to={adminOrdersPath({ ...search, page: 1 })} variant="secondary">
              첫 페이지로
            </LinkButton>
          </EmptyState>
        </div>
      ) : (
        <OrderTable search={search} data={data} />
      )}
    </>
  );
}

/** 주문번호·고객 이름 검색. 엔터를 치면 주소의 q가 바뀌고 1쪽부터 다시 본다. 상태 조건은 그대로 둔다. */
function OrderSearch({ search }: { search: AdminOrderSearch }) {
  return (
    <Form role="search" action="/admin/orders" className="relative ml-auto w-full md:w-80">
      {search.status !== undefined && <input type="hidden" name="status" value={search.status} />}
      <Icon name="search" className="pointer-events-none absolute top-2 left-3 size-5 text-ink-3" />
      <input
        key={search.q ?? ""}
        type="search"
        name="q"
        defaultValue={search.q ?? ""}
        maxLength={50}
        aria-label="주문 검색"
        placeholder="주문번호·고객 이름 검색"
        className="h-9 w-full rounded-md border border-ink-3 bg-ground pr-3 pl-10 text-sm text-ink placeholder:text-ink-3"
      />
    </Form>
  );
}

const th = "sticky top-0 bg-ground font-normal";

function OrderTable({ search, data }: { search: AdminOrderSearch; data: AdminOrderListResponse }) {
  const { orders } = data;
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

  const first = ((data.page ?? 1) - 1) * data.pageSize + 1;
  return (
    <section className="overflow-hidden rounded-md border border-line bg-ground">
      <div className="overflow-x-auto">
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
      <div className="flex h-17 items-center border-t border-line px-6">
        <p className="text-sm font-semibold text-ink-2 tabular-nums">
          {data.total.toLocaleString("ko-KR")}건 중 {first.toLocaleString("ko-KR")}–{(first + orders.length - 1).toLocaleString("ko-KR")}
        </p>
        <Pager search={search} page={data.page ?? 1} pageCount={data.pageCount} />
      </div>
    </section>
  );
}

const pagerItem = "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-semibold tabular-nums";

function Pager({ search, page, pageCount }: { search: AdminOrderSearch; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const to = (target: number) => adminOrdersPath({ ...search, page: target });
  return (
    <nav aria-label="페이지 이동" className="ml-auto flex items-center gap-1">
      {page > 1 ? (
        <Link to={to(page - 1)} className={`${pagerItem} border-line bg-ground text-ink`}>
          이전
        </Link>
      ) : (
        <span aria-disabled="true" className={`${pagerItem} border-line bg-canvas text-ink-3`}>
          이전
        </span>
      )}
      {pageWindow(page, pageCount).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${String(index)}`} aria-hidden="true" className="px-2 text-ink-3">
            …
          </span>
        ) : item === page ? (
          <span key={item} aria-current="page" className={`${pagerItem} border-ink bg-ink font-bold text-on-dark`}>
            {item}
          </span>
        ) : (
          <Link key={item} to={to(item)} aria-label={`${String(item)}쪽`} className={`${pagerItem} border-line bg-ground text-ink`}>
            {item}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link to={to(page + 1)} className={`${pagerItem} border-line bg-ground text-ink`}>
          다음
        </Link>
      ) : (
        <span aria-disabled="true" className={`${pagerItem} border-line bg-canvas text-ink-3`}>
          다음
        </span>
      )}
    </nav>
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
            <p className="mt-6 text-sm font-semibold text-ink-2">배송이 완료된 주문이에요</p>
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
