// 배송 추적
import { OrderParamsSchema } from "@grabmarket/contracts";
import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { LinkButton } from "../components/button.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { Page } from "../components/page.tsx";
import { EmptyState } from "../components/states.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { NotFoundError } from "../lib/not-found.ts";
import { streamed } from "../lib/streamed.ts";
import { legacyGet } from "./legacyApi.ts";
import { Panel, TableSkeleton } from "./ui.tsx";

export function trackingLoader({ params }: LoaderFunctionArgs) {
  const parsed = OrderParamsSchema.safeParse(params);
  if (!parsed.success) throw new NotFoundError("찾을 수 없는 주문입니다");
  return { result: streamed(legacyGet("/api/orders/" + parsed.data.orderId + "/tracking")) };
}

export function TrackingPage() {
  const { result } = useLoaderData<typeof trackingLoader>();
  return (
    <Page>
      <Loaded
        resolve={result}
        failure="배송 정보를 불러오지 못했어요"
        skeleton={<TableSkeleton rows={4} />}
        notFound={
          <EmptyState title="주문을 찾을 수 없어요" hint="내 주문에서 다시 골라 주세요">
            <LinkButton to="/orders" size="lg">
              내 주문 보기
            </LinkButton>
          </EmptyState>
        }
      >
        {(data: any) => <TrackingView data={data} />}
      </Loaded>
    </Page>
  );
}

function TrackingView({ data }: { data: any }) {
  const order = data.order;
  const s = data.shipment;
  return (
    <>
      <Link to={"/orders/" + order.id} className="inline-flex items-center gap-1 text-xs-plus font-semibold text-ink-2">
        <Icon name="chevronLeft" className="size-4" />
        주문 상세
      </Link>
      <h1 className="mt-3 flex flex-wrap items-center gap-3 text-xl leading-8 font-extrabold text-ink">
        배송 조회
        <StatusBadge status={order.status} />
        <span className="text-sm font-medium text-ink-3">{order.shortOrderNumber}</span>
      </h1>
      {!s ? (
        <div className="mt-4 rounded-md border border-line bg-ground">
          <EmptyState title="아직 송장이 없어요" hint={data.message} />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start">
          <Panel title="배송 단계" aside={<span className="text-sm font-bold text-ink">{s.arrivalText}</span>}>
            <ol className="px-4 py-4 md:px-6">
              {s.events.map((e: any, index: number) => {
                const current = e.key === s.currentStep;
                return (
                  <li key={e.key} className="relative flex gap-4 pb-5 last:pb-0">
                    {index < s.events.length - 1 && <span aria-hidden="true" className="absolute top-5 bottom-0 left-2.25 w-0.5 bg-line" />}
                    <span
                      aria-hidden="true"
                      className={`relative mt-0.5 size-5 shrink-0 rounded-pill border-2 ${current ? "border-ink bg-accent" : e.done ? "border-ink bg-ink" : "border-line bg-ground"}`}
                    />
                    <div className="min-w-0">
                      <p className={`text-sm ${current ? "font-extrabold text-ink" : e.done ? "font-semibold text-ink" : "text-ink-3"}`}>{e.title}</p>
                      <p className="text-xs-plus text-ink-3">
                        {e.location}
                        {e.atText ? " · " + e.atText : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="송장">
              <dl className="flex flex-col gap-2 px-4 py-4 text-sm md:px-6">
                <div className="flex justify-between">
                  <dt className="text-ink-3">택배사</dt>
                  <dd className="font-semibold text-ink">{s.courierName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-3">송장 번호</dt>
                  <dd className="font-mono font-semibold text-ink">{s.trackingNo}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-ink-3">받는 곳</dt>
                  <dd className="text-right font-semibold text-ink">{order.address}</dd>
                </div>
              </dl>
            </Panel>
            <Panel title="상품">
              <OrderLines items={order.items} size="sm" />
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
