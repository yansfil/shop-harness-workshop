// 내 배송 모아 보기
import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { Button, LinkButton } from "../components/button.tsx";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { EmptyState } from "../components/states.tsx";
import { StatusBadge } from "../components/status-badge.tsx";
import { streamed } from "../lib/streamed.ts";
import { legacyGet } from "./legacyApi.ts";
import { PageTitle, Panel, TableSkeleton } from "./ui.tsx";

export function shipmentsLoader() {
  return { result: streamed(legacyGet("/api/shipments/mine")) };
}

export function ShipmentsPage() {
  const { result } = useLoaderData<typeof shipmentsLoader>();
  return (
    <Page>
      <PageTitle title="배송 조회" />
      <Loaded resolve={result} failure="배송 정보를 불러오지 못했어요" skeleton={<TableSkeleton rows={4} />}>
        {(data: any) =>
          data.moving.length + data.arrived.length + data.waiting.length === 0 ? (
            <div className="rounded-md border border-line bg-ground">
              <EmptyState title="배송 중인 상품이 없어요" hint="주문하면 여기서 배송 단계를 볼 수 있어요">
                <LinkButton to="/" size="lg">
                  쇼핑하러 가기
                </LinkButton>
              </EmptyState>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Panel title={"배송 중 " + data.moving.length + "건"}>
                {data.moving.length === 0 ? <p className="px-4 py-5 text-sm text-ink-3 md:px-6">지금 배송 중인 상품이 없어요.</p> : <ShipmentList rows={data.moving} />}
              </Panel>
              {data.waiting.length > 0 && (
                <Panel title={"출고 준비 " + data.waiting.length + "건"}>
                  <ul>
                    {data.waiting.map((w: any) => (
                      <li key={w.orderId} className="border-b border-line last:border-b-0">
                        <Link to={"/orders/" + w.orderId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-6">
                          <span className="min-w-0">
                            <span className="flex items-center gap-2 text-sm font-bold text-ink">
                              {w.shortOrderNumber}
                              <StatusBadge status={w.status} />
                            </span>
                            <span className="block truncate text-xs-plus text-ink-2">{w.itemSummary}</span>
                          </span>
                          <span className="text-xs-plus text-ink-3">{w.shipByText}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}
              {data.arrived.length > 0 && (
                <ArrivedPanel rows={data.arrived} />
              )}
            </div>
          )
        }
      </Loaded>
    </Page>
  );
}

function ShipmentList({ rows }: { rows: any[] }) {
  return (
    <ul>
      {rows.map((s: any) => (
        <li key={s.orderId} className="border-b border-line last:border-b-0">
          <Link to={"/orders/" + s.orderId + "/tracking"} className="flex flex-col gap-2 px-4 py-4 md:px-6">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0">
                <b className="text-sm font-bold text-ink">{s.itemSummary}</b>
                <span className="ml-2 text-xs-plus text-ink-3">{s.shortOrderNumber}</span>
              </span>
              <span className="text-sm font-bold text-ink">{s.arrivalText}</span>
            </span>
            <span className="grid gap-1" style={{ gridTemplateColumns: "repeat(" + s.stepCount + ", minmax(0, 1fr))" }} aria-label={s.stepText}>
              {Array.from({ length: s.stepCount }).map((_, i) => (
                <span key={i} aria-hidden="true" className={`h-1.5 rounded-sm ${i < s.stepIndex || s.stepIndex === s.stepCount - 1 ? "bg-ink" : i === s.stepIndex ? "border border-ink bg-accent" : "bg-line"}`} />
              ))}
            </span>
            <span className="text-xs-plus text-ink-2">
              {s.stepText} · {s.courierName} {s.trackingNo}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ArrivedPanel({ rows }: { rows: any[] }) {
  const [shown, setShown] = useState(10);
  return (
    <Panel title="도착한 상품">
      <ShipmentList rows={rows.slice(0, shown)} />
      {rows.length > shown && (
        <div className="border-t border-line px-4 py-3 text-center md:px-6">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShown(shown + 10);
            }}
          >
            더 보기 ({shown}/{rows.length})
          </Button>
        </div>
      )}
    </Panel>
  );
}
