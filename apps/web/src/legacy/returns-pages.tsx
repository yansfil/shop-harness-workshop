// 반품·교환: 내 신청 목록과 신청서
import { useState } from "react";
import { Link, type LoaderFunctionArgs, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { Button, LinkButton } from "../components/button.tsx";
import { Checkbox } from "../components/checkbox.tsx";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { EmptyState } from "../components/states.tsx";
import { streamed } from "../lib/streamed.ts";
import { errorText, fieldError, legacyGet, legacyPost } from "./legacyApi.ts";
import { ConfirmDialog, FieldMessage, Notice, PageTitle, Panel, TableSkeleton, Tag, fieldClass, labelClass } from "./ui.tsx";
import { wonText } from "./money.ts";

export const RETURN_TONE: any = { requested: "yellow", approved: "green", rejected: "red", withdrawn: "muted" };

export function myReturnsLoader() {
  return { result: streamed(legacyGet("/api/returns")) };
}

export function MyReturnsPage() {
  const { result } = useLoaderData<typeof myReturnsLoader>();
  return (
    <Page>
      <PageTitle title="반품·교환">
        <LinkButton to="/returns/new" size="sm" className="h-10">
          신청하기
        </LinkButton>
      </PageTitle>
      <Loaded resolve={result} failure="반품·교환 내역을 불러오지 못했어요" skeleton={<TableSkeleton rows={3} />}>
        {(data: any) => <MyReturnsView requests={data.requests} />}
      </Loaded>
    </Page>
  );
}

function MyReturnsView({ requests }: { requests: any[] }) {
  const revalidator = useRevalidator();
  const [withdrawing, setWithdrawing] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<any>(null);
  if (requests.length === 0) {
    return (
      <div className="rounded-md border border-line bg-ground">
        <EmptyState title="반품·교환 신청이 없어요" hint="배송이 끝난 뒤 7일 안에 신청할 수 있어요" />
      </div>
    );
  }
  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      await legacyPost("/api/returns/" + withdrawing.id + "/withdraw");
      setWithdrawing(null);
      setNotice({ kind: "ok", text: "신청을 취소했어요." });
      void revalidator.revalidate();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Notice notice={notice} />
      {requests.map((r: any) => (
        <Panel
          key={r.id}
          title={
            <span className="flex flex-wrap items-center gap-2">
              {r.kindText} {r.requestNo}
              <Tag tone={RETURN_TONE[r.state] || "gray"}>{r.stateText}</Tag>
            </span>
          }
          aside={<span className="text-xs-plus text-ink-3">{r.createdAtText} 신청</span>}
        >
          <div className="flex flex-col gap-2 px-4 py-4 text-sm md:px-6">
            <p className="text-ink">
              <Link to={"/orders/" + r.orderId} className="font-bold underline underline-offset-2">
                {r.shortOrderNumber}
              </Link>{" "}
              · {r.itemSummary}
            </p>
            <p className="text-ink-2">사유: {r.reasonText}{r.detail ? " · " + r.detail : ""}</p>
            {r.state === "approved" && r.kind === "return" && <p className="font-bold text-ink">환불 {wonText(r.refundAmount)}</p>}
            {r.state === "rejected" && <p className="text-danger">거절 이유: {r.rejectReason}</p>}
            {r.reship && (
              <p className="text-ink-2">
                {r.reship.stateText} · {r.reship.courierName} {r.reship.trackingNo}
              </p>
            )}
            {r.state === "requested" && (
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setWithdrawing(r);
                    setError(null);
                  }}
                >
                  신청 취소
                </Button>
              </div>
            )}
          </div>
        </Panel>
      ))}
      {withdrawing && (
        <ConfirmDialog
          title="신청을 취소할까요?"
          body={withdrawing.requestNo + " " + withdrawing.kindText + " 신청을 취소해요. 기간 안이면 다시 신청할 수 있어요."}
          confirmLabel="신청 취소"
          busy={busy}
          error={error}
          onClose={() => {
            setWithdrawing(null);
          }}
          onConfirm={() => void withdraw()}
        />
      )}
    </div>
  );
}

// ---- 신청서 ----

export function returnFormLoader({ request }: LoaderFunctionArgs) {
  const orderId = new URL(request.url).searchParams.get("orderId");
  return { orderId: orderId === null ? null : Number(orderId), result: streamed(legacyGet("/api/returns/eligible-orders")) };
}

export function ReturnFormPage() {
  const { orderId, result } = useLoaderData<typeof returnFormLoader>();
  return (
    <Page>
      <PageTitle title="반품·교환 신청" />
      <Loaded resolve={result} failure="신청할 수 있는 주문을 불러오지 못했어요" skeleton={<TableSkeleton rows={3} />}>
        {(data: any) => <ReturnForm data={data} initialOrderId={orderId} />}
      </Loaded>
    </Page>
  );
}

function ReturnForm({ data, initialOrderId }: { data: any; initialOrderId: number | null }) {
  const navigate = useNavigate();
  const firstEligible = data.orders.find((o: any) => o.eligible);
  const start = data.orders.find((o: any) => o.id === initialOrderId) || firstEligible || null;
  const [orderId, setOrderId] = useState<number | null>(start ? start.id : null);
  const [kind, setKind] = useState("return");
  const [reasonCode, setReasonCode] = useState(data.reasons[0] ? data.reasons[0].code : "");
  const [detail, setDetail] = useState("");
  const [picked, setPicked] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);

  if (data.orders.length === 0) {
    return (
      <div className="rounded-md border border-line bg-ground">
        <EmptyState title="신청할 수 있는 주문이 없어요" hint={"배송이 끝난 뒤 " + data.returnDays + "일 안의 주문만 신청할 수 있어요"}>
          <LinkButton to="/orders" size="lg">
            내 주문 보기
          </LinkButton>
        </EmptyState>
      </div>
    );
  }

  const order = data.orders.find((o: any) => o.id === orderId) || null;
  const lines = order ? order.items.filter((i: any) => picked[i.orderItemId] > 0).map((i: any) => ({ orderItemId: i.orderItemId, quantity: picked[i.orderItemId] })) : [];
  let refund = 0;
  if (order && kind === "return") for (const i of order.items) refund += (picked[i.orderItemId] || 0) * i.unitPrice;

  async function submit() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      await legacyPost("/api/returns", { orderId: order.id, kind: kind, reasonCode: reasonCode, detail: detail, items: lines });
      void navigate("/returns", { replace: true });
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start">
      <div className="flex flex-col gap-3">
        <Panel title="주문 고르기">
          <ul>
            {data.orders.map((o: any) => (
              <li key={o.id} className="border-b border-line last:border-b-0">
                <label className={`flex items-center gap-3 px-4 py-3 md:px-6 ${o.eligible ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}>
                  <input
                    type="radio"
                    name="order"
                    disabled={!o.eligible}
                    checked={orderId === o.id}
                    onChange={() => {
                      setOrderId(o.id);
                      setPicked({});
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">
                      {o.shortOrderNumber} <span className="font-normal text-ink-3">{o.deliveredAtText} 도착</span>
                    </span>
                    <span className="block truncate text-xs-plus text-ink-2">{o.items.map((i: any) => i.productName).join(", ")}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-3">{o.eligible ? o.deadlineText : o.reason}</span>
                </label>
              </li>
            ))}
          </ul>
        </Panel>
        {order && (
          <Panel title="상품과 수량">
            <ul>
              {order.items.map((i: any) => {
                const qty = picked[i.orderItemId] || 0;
                const none = i.remaining <= 0;
                return (
                  <li key={i.orderItemId} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 md:px-6">
                    <Checkbox
                      label={i.productName}
                      checked={qty > 0}
                      disabled={none}
                      onChange={(checked) => {
                        setPicked({ ...picked, [i.orderItemId]: checked ? 1 : 0 });
                      }}
                    />
                    <img src={i.imageUrl} alt="" className="size-12 shrink-0 rounded-sm bg-canvas object-cover" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{i.productName}</span>
                      <span className="block text-xs-plus text-ink-3">
                        {wonText(i.unitPrice)} · {none ? "이미 신청한 상품" : "신청 가능 " + i.remaining + "개"}
                      </span>
                    </span>
                    {qty > 0 && (
                      <select
                        aria-label="수량"
                        className={`${fieldClass} w-20`}
                        value={qty}
                        onChange={(event) => {
                          setPicked({ ...picked, [i.orderItemId]: Number(event.target.value) });
                        }}
                      >
                        {Array.from({ length: i.remaining }).map((_, n) => (
                          <option key={n} value={n + 1}>
                            {n + 1}개
                          </option>
                        ))}
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
            <FieldMessage text={fieldError(error, "items")} />
          </Panel>
        )}
      </div>
      <aside className="rounded-md border border-line bg-ground p-6">
        <fieldset>
          <legend className={labelClass}>무엇을 할까요?</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { v: "return", t: "반품(환불)" },
              { v: "exchange", t: "교환(같은 상품)" },
            ].map((k) => (
              <label key={k.v} className={`flex h-10 cursor-pointer items-center justify-center rounded-md border text-sm ${kind === k.v ? "border-ink font-bold text-ink" : "border-line text-ink-2"}`}>
                <input
                  type="radio"
                  name="kind"
                  className="sr-only"
                  checked={kind === k.v}
                  onChange={() => {
                    setKind(k.v);
                  }}
                />
                {k.t}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-4 flex flex-col gap-1">
          <span className={labelClass}>사유</span>
          <select
            className={fieldClass}
            value={reasonCode}
            onChange={(event) => {
              setReasonCode(event.target.value);
            }}
          >
            {data.reasons.map((r: any) => (
              <option key={r.code} value={r.code}>
                {r.text}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-4 flex flex-col gap-1">
          <span className={labelClass}>자세한 내용 (선택)</span>
          <textarea
            className="min-h-20 w-full rounded-md border border-ink-3 bg-ground p-3 text-sm text-ink"
            maxLength={500}
            value={detail}
            onChange={(event) => {
              setDetail(event.target.value);
            }}
          />
        </label>
        <dl className="mt-4 flex items-center justify-between border-t border-line pt-4">
          <dt className="text-sm font-bold text-ink">{kind === "return" ? "환불 예정 금액" : "교환 상품"}</dt>
          <dd className="text-xl font-extrabold text-ink">{kind === "return" ? wonText(refund) : lines.length + "종"}</dd>
        </dl>
        {error && !fieldError(error, "items") && (
          <p role="alert" className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-xs-plus font-semibold text-danger">
            {errorText(error)}
          </p>
        )}
        <Button size="lg" className="mt-4 w-full" disabled={!order || lines.length === 0 || busy} onClick={() => void submit()}>
          {busy ? "신청하는 중" : "신청하기"}
        </Button>
        <p className="mt-2 text-xs text-ink-3">관리자가 확인한 뒤 승인되면 알림으로 알려 드려요.</p>
      </aside>
    </div>
  );
}
