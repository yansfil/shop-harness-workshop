// 내 쿠폰 지갑
import { useState } from "react";
import { useLoaderData } from "react-router";
import { LinkButton } from "../components/button.tsx";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { EmptyState } from "../components/states.tsx";
import { krw } from "../lib/format.ts";
import { streamed } from "../lib/streamed.ts";
import { legacyGet } from "./legacyApi.ts";
import { PageTitle, SegmentTabs, TableSkeleton, Tag } from "./ui.tsx";

export function couponsLoader() {
  return { result: streamed(legacyGet("/api/coupons/mine")) };
}

const STATE_TEXT: any = { active: "사용 가능", used: "사용함", expired: "기간 끝남", scheduled: "시작 전", exhausted: "소진", paused: "잠시 중지" };

export function CouponsPage() {
  const { result } = useLoaderData<typeof couponsLoader>();
  return (
    <Page>
      <Loaded resolve={result} failure="쿠폰을 불러오지 못했어요" skeleton={<TableSkeleton rows={3} />}>
        {(data: any) => <CouponsView data={data} />}
      </Loaded>
    </Page>
  );
}

function CouponsView({ data }: { data: any }) {
  const [tab, setTab] = useState("usable");
  const usable = data.coupons.filter((c: any) => c.usable);
  const others = data.coupons.filter((c: any) => !c.usable);
  const rows = tab === "usable" ? usable : others;
  return (
    <>
      <PageTitle title="쿠폰" count={"쓸 수 있는 쿠폰 " + usable.length + "장"}>
        <SegmentTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "usable", label: "쓸 수 있음", count: usable.length },
            { value: "other", label: "지난 쿠폰", count: others.length },
          ]}
        />
      </PageTitle>
      {rows.length === 0 ? (
        <div className="rounded-md border border-line bg-ground">
          <EmptyState title={tab === "usable" ? "쓸 수 있는 쿠폰이 없어요" : "지난 쿠폰이 없어요"} hint="새 쿠폰이 오면 알림으로 알려 드려요">
            <LinkButton to="/" size="lg">
              쇼핑하러 가기
            </LinkButton>
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((c: any) => (
            <li key={c.couponId} className={`flex overflow-hidden rounded-md border border-line bg-ground ${c.usable ? "" : "opacity-70"}`}>
              <div className={`flex w-28 shrink-0 flex-col items-center justify-center px-2 ${c.usable ? "bg-accent-soft" : "bg-canvas"}`}>
                <span className="text-lg font-extrabold text-ink">{krw(c.discountAmount)}</span>
                <span className="text-xs text-ink-2">할인</span>
              </div>
              <div className="min-w-0 flex-1 p-4">
                <p className="flex items-center gap-2">
                  <b className="truncate text-sm font-extrabold text-ink">{c.name}</b>
                  <Tag tone={c.usable ? "green" : "muted"}>{STATE_TEXT[c.state] || c.state}</Tag>
                </p>
                <p className="mt-1 text-xs-plus text-ink-2">
                  코드 <b className="font-mono font-bold text-ink">{c.code}</b> · {krw(c.minOrderAmount)} 이상 주문 · {c.endsAtText}
                </p>
                {c.reason && <p className="mt-1 text-xs text-ink-3">{c.reason}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs-plus text-ink-3">쿠폰은 주문서에서 코드를 넣거나 골라서 쓸 수 있어요. 한 주문에 한 장만 쓸 수 있어요.</p>
    </>
  );
}
