// 내 포인트: 잔액, 소멸 예정, 내역
import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { EmptyState } from "../components/states.tsx";
import { streamed } from "../lib/streamed.ts";
import { legacyGet } from "./legacyApi.ts";
import { pointText, signedPoint } from "./money.ts";
import { PageTitle, Panel, SegmentTabs, TableBox, TableSkeleton, Tag, Td, Th } from "./ui.tsx";

export function pointsLoader() {
  return { result: streamed(Promise.all([legacyGet("/api/points"), legacyGet("/api/points/expiring")])) };
}

const KIND_TONE: any = { earn: "green", use: "gray", expire: "muted", refund: "blue", admin: "accent" };

export function PointsPage() {
  const { result } = useLoaderData<typeof pointsLoader>();
  return (
    <Page>
      <PageTitle title="포인트" />
      <Loaded resolve={result} failure="포인트를 불러오지 못했어요" skeleton={<TableSkeleton />}>
        {([points, expiring]: any) => <PointsView points={points} expiring={expiring} />}
      </Loaded>
    </Page>
  );
}

function PointsView({ points, expiring }: { points: any; expiring: any }) {
  const [kind, setKind] = useState("all");
  const rows = kind === "all" ? points.history : points.history.filter((h: any) => (kind === "plus" ? h.amount > 0 : h.amount < 0));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="rounded-md border border-line bg-ground p-6">
          <p className="text-sm text-ink-3">쓸 수 있는 포인트</p>
          <p className="mt-1 text-2xl leading-9 font-extrabold text-ink">{pointText(points.balance)}</p>
          <p className="mt-2 text-xs-plus text-ink-2">1P는 1원으로 쓸 수 있어요. 결제 금액의 1%가 쌓이고, 쌓인 지 1년이 지나면 사라져요.</p>
          {expiring.soonText && (
            <p className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-xs-plus font-semibold text-danger">{expiring.soonText}</p>
          )}
        </div>
        <Panel title="소멸 예정">
          {expiring.months.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-3 md:px-6">앞으로 사라질 포인트가 없어요.</p>
          ) : (
            <ul>
              {expiring.months.map((m: any) => (
                <li key={m.month} className="flex items-center justify-between border-b border-line px-4 py-3 text-sm last:border-b-0 md:px-6">
                  <span className="text-ink-2">
                    {m.month.slice(0, 4)}년 {m.monthText} <span className="text-xs text-ink-3">{m.firstDateText}부터</span>
                  </span>
                  <b className="font-bold text-ink">{pointText(m.points)}</b>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <Panel
        title="포인트 내역"
        aside={
          <SegmentTabs
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "전체" },
              { value: "plus", label: "쌓임" },
              { value: "minus", label: "쓰임" },
            ]}
          />
        }
      >
        {rows.length === 0 ? (
          <EmptyState title="포인트 내역이 없어요" hint="주문하면 결제 금액의 1%가 쌓여요" />
        ) : (
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>일시</Th>
                <Th>내용</Th>
                <Th>구분</Th>
                <Th right>포인트</Th>
                <Th right>잔액</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h: any) => (
                <tr key={h.id} className="border-b border-line last:border-b-0">
                  <Td className="whitespace-nowrap text-ink-2">{h.createdAtText}</Td>
                  <Td>
                    {h.orderId ? (
                      <Link to={"/orders/" + h.orderId} className="underline underline-offset-2">
                        {h.description}
                      </Link>
                    ) : (
                      h.description
                    )}
                  </Td>
                  <Td>
                    <Tag tone={KIND_TONE[h.kind] || "gray"}>{h.kindText}</Tag>
                  </Td>
                  <Td right className={h.amount > 0 ? "font-bold" : "text-ink-2"}>
                    {signedPoint(h.amount)}
                  </Td>
                  <Td right className="text-ink-2">
                    {pointText(h.balanceAfter)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableBox>
        )}
      </Panel>
    </div>
  );
}
