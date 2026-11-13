// 관리자 정산: 일별·월별·항목별·지급·결제 내역
import { useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useNavigate, useRevalidator, useSearchParams } from "react-router";
import { Button } from "../../components/button.tsx";
import { Loaded } from "../../components/loaded.tsx";
import { EmptyState } from "../../components/states.tsx";
import { krw } from "../../lib/format.ts";
import { streamed } from "../../lib/streamed.ts";
import { csvHref, errorText, fieldError, legacyGet, legacyPost } from "../legacyApi.ts";
import { comma } from "../money.ts";
import {
  ConfirmDialog,
  CsvLink,
  DateRange,
  FieldMessage,
  Money,
  Notice,
  PageTitle,
  Panel,
  RouteTabs,
  Stat,
  TableBox,
  TableSkeleton,
  Tag,
  Td,
  Th,
  fieldClass,
  labelClass,
} from "../ui.tsx";

function SettlementTabs() {
  return (
    <RouteTabs
      tabs={[
        { to: "/admin/settlements", label: "일별" },
        { to: "/admin/settlements/monthly", label: "월별" },
        { to: "/admin/settlements/breakdown", label: "항목별" },
        { to: "/admin/settlements/payouts", label: "지급·조정" },
        { to: "/admin/settlements/payments", label: "결제 내역" },
      ]}
    />
  );
}

function queryOf(request: Request, keys: string[]): any {
  const params = new URL(request.url).searchParams;
  const out: any = {};
  for (const k of keys) {
    const v = params.get(k);
    if (v !== null && v !== "") out[k] = v;
  }
  return out;
}

/** 주소의 검색 조건을 바꾼다 */
function useQueryUpdate() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  return (changes: any) => {
    const next = new URLSearchParams(params);
    for (const k of Object.keys(changes)) {
      if (changes[k] === null || changes[k] === undefined || changes[k] === "") next.delete(k);
      else next.set(k, String(changes[k]));
    }
    void navigate("?" + next.toString());
  };
}

function SearchBox({ value, onSearch, placeholder }: { value: string; onSearch: (q: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(text.trim());
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>검색</span>
        <input
          className={`${fieldClass} w-56`}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </label>
      <Button type="submit" variant="secondary" size="sm" className="h-10">
        찾기
      </Button>
      {value !== "" && (
        <Button
          variant="secondary"
          size="sm"
          className="h-10"
          onClick={() => {
            setText("");
            onSearch("");
          }}
        >
          지우기
        </Button>
      )}
    </form>
  );
}

const AMOUNT_HEAD = (first: string) => (
  <tr className="border-b border-line">
    <Th>{first}</Th>
    <Th right>주문</Th>
    <Th right>상품 매출</Th>
    <Th right>배송비</Th>
    <Th right>쿠폰 할인</Th>
    <Th right>포인트 사용</Th>
    <Th right>정산 금액</Th>
  </tr>
);

function AmountCells({ row, strong = false }: { row: any; strong?: boolean }) {
  return (
    <>
      <Td right>{comma(row.orderCount)}</Td>
      <Td right>
        <Money value={row.goodsAmount} />
      </Td>
      <Td right>
        <Money value={row.shippingAmount} />
      </Td>
      <Td right>
        <Money value={row.couponDiscount} />
      </Td>
      <Td right>
        <Money value={row.pointUsed} />
      </Td>
      <Td right>
        <Money value={row.netAmount} strong={strong} />
      </Td>
    </>
  );
}

// ---- 일별 ----

export function dailyLoader({ request }: LoaderFunctionArgs) {
  const q = queryOf(request, ["from", "to", "q"]);
  return { q: q, result: streamed(legacyGet("/api/admin/settlements/daily", q)) };
}

export function DailySettlementPage() {
  const { q, result } = useLoaderData<typeof dailyLoader>();
  const update = useQueryUpdate();
  return (
    <>
      <PageTitle title="정산" />
      <SettlementTabs />
      <Loaded resolve={result} failure="정산을 불러오지 못했어요" skeleton={<TableSkeleton rows={8} />}>
        {(report: any) => (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-end gap-4">
                <DateRange
                  from={report.from}
                  to={report.to}
                  onChange={(from, to) => {
                    update({ from: from, to: to });
                  }}
                />
                <SearchBox
                  value={q.q || ""}
                  placeholder="주문번호 또는 고객 이름"
                  onSearch={(text) => {
                    update({ q: text });
                  }}
                />
              </div>
              <CsvLink href={csvHref("/api/admin/settlements/daily.csv", { from: report.from, to: report.to, q: q.q })} />
            </div>
            <Panel title={report.periodText + (report.keyword ? " · '" + report.keyword + "' 검색" : "")} aside={<span className="text-xs-plus text-ink-3">하루는 0시~24시(UTC) 기준</span>}>
              <TableBox>
                <thead>{AMOUNT_HEAD("일자")}</thead>
                <tbody>
                  <tr className="border-b-2 border-ink bg-canvas">
                    <Td className="font-extrabold">합계</Td>
                    <AmountCells row={report.total} strong />
                  </tr>
                  {report.rows.map((r: any) => (
                    <tr key={r.day} className="border-b border-line last:border-b-0">
                      <Td className="whitespace-nowrap">
                        <span className="flex items-center gap-2">
                          {r.label}
                          {r.closed ? <Tag tone="green">마감</Tag> : <Tag tone="muted">마감 전</Tag>}
                        </span>
                      </Td>
                      <AmountCells row={r} />
                    </tr>
                  ))}
                </tbody>
              </TableBox>
            </Panel>
          </div>
        )}
      </Loaded>
    </>
  );
}

// ---- 월별 ----

export function monthlyLoader({ request }: LoaderFunctionArgs) {
  const q = queryOf(request, ["q"]);
  return { q: q, result: streamed(Promise.all([legacyGet("/api/admin/settlements/monthly", q), legacyGet("/api/admin/settlements/compare")])) };
}

export function MonthlySettlementPage() {
  const { q, result } = useLoaderData<typeof monthlyLoader>();
  const update = useQueryUpdate();
  return (
    <>
      <PageTitle title="정산" />
      <SettlementTabs />
      <Loaded resolve={result} failure="정산을 불러오지 못했어요" skeleton={<TableSkeleton rows={8} />}>
        {([report, compare]: any) => {
          const byMonth: any = {};
          for (const c of compare.rows) byMonth[c.month] = c;
          return (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <SearchBox
                  value={q.q || ""}
                  placeholder="주문번호 또는 고객 이름"
                  onSearch={(text) => {
                    update({ q: text });
                  }}
                />
                <CsvLink href={csvHref("/api/admin/settlements/monthly.csv", { q: q.q })} />
              </div>
              <Panel title={report.periodText || "월별 정산"}>
                {report.rows.length === 0 ? (
                  <EmptyState title="정산할 주문이 없어요" />
                ) : (
                  <TableBox>
                    <thead>
                      <tr className="border-b border-line">
                        <Th>월</Th>
                        <Th right>주문</Th>
                        <Th right>상품 매출</Th>
                        <Th right>배송비</Th>
                        <Th right>쿠폰 할인</Th>
                        <Th right>포인트 사용</Th>
                        <Th right>정산 금액</Th>
                        <Th right>앞 달 대비</Th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b-2 border-ink bg-canvas">
                        <Td className="font-extrabold">합계</Td>
                        <AmountCells row={report.total} strong />
                        <Td />
                      </tr>
                      {report.rows.map((r: any) => (
                        <tr key={r.month} className="border-b border-line last:border-b-0">
                          <Td className="whitespace-nowrap">{r.month.slice(0, 4) + "년 " + r.label}</Td>
                          <AmountCells row={r} />
                          <Td right className="text-ink-2">
                            {byMonth[r.month] && !report.keyword ? byMonth[r.month].vsPrevText : "-"}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableBox>
                )}
              </Panel>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}

// ---- 항목별 ----

export function breakdownLoader({ request }: LoaderFunctionArgs) {
  const q = queryOf(request, ["from", "to"]);
  return { result: streamed(legacyGet("/api/admin/settlements/breakdown", q)) };
}

export function BreakdownPage() {
  const { result } = useLoaderData<typeof breakdownLoader>();
  const update = useQueryUpdate();
  return (
    <>
      <PageTitle title="정산" />
      <SettlementTabs />
      <Loaded resolve={result} failure="항목별 정산을 불러오지 못했어요" skeleton={<TableSkeleton rows={8} />}>
        {(r: any) => {
          const range = { from: r.from, to: r.to };
          const maxHour = Math.max(1, ...r.hours.map((h: any) => h.orderCount));
          return (
            <div className="flex flex-col gap-3">
              <DateRange
                from={r.from}
                to={r.to}
                onChange={(from, to) => {
                  update({ from: from, to: to });
                }}
              />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="주문" value={comma(r.summary.orderCount) + "건"} sub={"앞 기간 대비 " + r.summary.orderCountChange} />
                <Stat label="주문 금액" value={krw(r.summary.totalAmount)} sub={"앞 기간 대비 " + r.summary.totalChange} />
                <Stat label="평균 주문 금액" value={krw(r.summary.averageOrder)} sub={"고객 " + comma(r.summary.customerCount) + "명"} />
                <Stat label="취소·반품 환불" value={krw(r.summary.cancelAmount + r.summary.returnAmount)} sub={"취소 " + r.summary.cancelCount + "건 · 반품 " + r.summary.returnCount + "건"} />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <Panel title="카테고리" aside={<CsvLink href={csvHref("/api/admin/settlements/breakdown/category.csv", range)} />}>
                  <TableBox>
                    <thead>
                      <tr className="border-b border-line">
                        <Th>카테고리</Th>
                        <Th right>수량</Th>
                        <Th right>상품 매출</Th>
                        <Th>비중</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.categories.map((c: any) => (
                        <tr key={c.categoryId} className="border-b border-line last:border-b-0">
                          <Td>{c.name}</Td>
                          <Td right>{comma(c.quantity)}</Td>
                          <Td right>
                            <Money value={c.goodsAmount} />
                          </Td>
                          <Td>
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-20 rounded-sm bg-line">
                                <span className="block h-2 rounded-sm bg-ink" style={{ width: Math.round(c.share * 100) + "%" }} />
                              </span>
                              <span className="text-xs text-ink-2">{c.shareText}</span>
                            </span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableBox>
                </Panel>
                <Panel title="많이 팔린 상품" aside={<CsvLink href={csvHref("/api/admin/settlements/breakdown/product.csv", range)} />}>
                  <TableBox>
                    <thead>
                      <tr className="border-b border-line">
                        <Th>순위</Th>
                        <Th>상품</Th>
                        <Th right>수량</Th>
                        <Th right>상품 매출</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.products.map((p: any) => (
                        <tr key={p.productId} className="border-b border-line last:border-b-0">
                          <Td className="text-ink-3">{p.rank}</Td>
                          <Td>
                            <span className="block max-w-56 truncate">{p.name}</span>
                          </Td>
                          <Td right>{comma(p.quantity)}</Td>
                          <Td right>
                            <Money value={p.goodsAmount} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableBox>
                </Panel>
                <Panel title="쿠폰" aside={<CsvLink href={csvHref("/api/admin/settlements/breakdown/coupon.csv", range)} />}>
                  {r.coupons.length === 0 ? (
                    <p className="px-4 py-5 text-sm text-ink-3 md:px-6">이 기간에 쓴 쿠폰이 없어요.</p>
                  ) : (
                    <TableBox>
                      <thead>
                        <tr className="border-b border-line">
                          <Th>쿠폰</Th>
                          <Th right>사용</Th>
                          <Th right>할인 금액</Th>
                          <Th right>주문 금액</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.coupons.map((c: any) => (
                          <tr key={c.couponId} className="border-b border-line last:border-b-0">
                            <Td>
                              <b className="font-mono font-bold">{c.code}</b> <span className="text-xs text-ink-3">{c.name}</span>
                            </Td>
                            <Td right>{comma(c.uses)}</Td>
                            <Td right>
                              <Money value={c.discount} />
                            </Td>
                            <Td right>
                              <Money value={c.orderTotal} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableBox>
                  )}
                </Panel>
                <Panel title="포인트">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-4 text-sm md:px-6">
                    {r.points.rows.map((p: any) => (
                      <div key={p.kind} className="flex justify-between">
                        <dt className="text-ink-3">{p.label}</dt>
                        <dd className="font-semibold text-ink">{comma(p.amount)}P</dd>
                      </div>
                    ))}
                    <div className="col-span-2 mt-2 flex justify-between border-t border-line pt-3">
                      <dt className="font-bold text-ink">남은 포인트 전체</dt>
                      <dd className="font-extrabold text-ink">{comma(r.points.outstanding)}P</dd>
                    </div>
                  </dl>
                </Panel>
              </div>
              <Panel title="시간대별 주문 (UTC)" aside={r.peakHourText ? <span className="text-xs-plus text-ink-2">가장 많은 때 {r.peakHourText}</span> : null}>
                <div className="flex h-40 items-end gap-1 px-4 pt-4 pb-2 md:px-6">
                  {r.hours.map((h: any) => (
                    <div key={h.hour} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={h.label + " " + h.orderCount + "건"}>
                      <span className="w-full rounded-t-sm bg-ink" style={{ height: Math.round((h.orderCount / maxHour) * 100) + "%" }} />
                      <span className="text-2xs text-ink-3">{h.hour % 3 === 0 ? h.hour : ""}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}

// ---- 지급·조정 ----

export function payoutsLoader({ request }: LoaderFunctionArgs) {
  const q = queryOf(request, ["from", "to"]);
  return { q: q, result: streamed(Promise.all([legacyGet("/api/admin/settlements/payouts", q), legacyGet("/api/admin/settlements/adjustments", q)])) };
}

export function PayoutsPage() {
  const { result } = useLoaderData<typeof payoutsLoader>();
  const update = useQueryUpdate();
  return (
    <>
      <PageTitle title="정산" />
      <SettlementTabs />
      <Loaded resolve={result} failure="지급 일정을 불러오지 못했어요" skeleton={<TableSkeleton rows={8} />}>
        {([payouts, adjustments]: any) => (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <DateRange
                from={payouts.from}
                to={payouts.to}
                onChange={(from, to) => {
                  update({ from: from, to: to });
                }}
              />
              <CsvLink href={csvHref("/api/admin/settlements/payouts.csv", { from: payouts.from, to: payouts.to })} />
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Stat label="지급 예정" value={krw(payouts.scheduledAmount)} sub={payouts.payoutRuleText} />
              <Stat label="지급됨" value={krw(payouts.paidAmount)} />
              <Stat label="조정 합계" value={krw(adjustments.totalAmount)} sub={adjustments.rows.filter((a: any) => !a.cancelled).length + "건"} />
            </div>
            <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
              <PayoutTable rows={payouts.rows} />
              <AdjustmentPanel adjustments={adjustments} />
            </div>
          </div>
        )}
      </Loaded>
    </>
  );
}

function PayoutTable({ rows }: { rows: any[] }) {
  const revalidator = useRevalidator();
  const [target, setTarget] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<any>(null);
  async function reclose() {
    setBusy(true);
    setError(null);
    try {
      const r = await legacyPost("/api/admin/settlements/close/" + target.day);
      setTarget(null);
      setNotice({ kind: "ok", text: r.dayText + " 다시 마감했어요" + (r.difference ? " (차이 " + krw(r.difference) + ")" : " (차이 없음)") });
      void revalidator.revalidate();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="일별 지급">
      {notice && (
        <div className="px-4 pt-3 md:px-6">
          <Notice notice={notice} />
        </div>
      )}
      <TableBox>
        <thead>
          <tr className="border-b border-line">
            <Th>정산일</Th>
            <Th right>정산 금액</Th>
            <Th right>조정</Th>
            <Th right>지급 금액</Th>
            <Th>지급일</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.day} className="border-b border-line last:border-b-0">
              <Td className="whitespace-nowrap">{r.dayText}</Td>
              <Td right>
                <Money value={r.netAmount} />
              </Td>
              <Td right className={r.adjustment < 0 ? "text-danger" : ""}>
                {r.adjustment !== 0 ? krw(r.adjustment) : "-"}
              </Td>
              <Td right>
                <Money value={r.payoutAmount} strong />
              </Td>
              <Td className="whitespace-nowrap">
                <span className="flex items-center gap-2">
                  {r.payoutDayText}
                  <Tag tone={r.payoutState === "paid" ? "green" : r.payoutState === "scheduled" ? "blue" : "muted"}>{r.payoutStateText}</Tag>
                </span>
              </Td>
              <Td right>
                {r.closed && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setTarget(r);
                      setError(null);
                    }}
                  >
                    다시 마감
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TableBox>
      {target && (
        <ConfirmDialog
          title={target.dayText + "을 다시 마감할까요?"}
          body="그날 주문을 다시 계산해 정산 금액을 바꿔요. 늦게 반영된 취소·반품이 있을 때 써요."
          confirmLabel="다시 마감"
          busy={busy}
          error={error}
          onClose={() => {
            setTarget(null);
          }}
          onConfirm={() => void reclose()}
        />
      )}
    </Panel>
  );
}

function AdjustmentPanel({ adjustments }: { adjustments: any }) {
  const revalidator = useRevalidator();
  const [form, setForm] = useState({ day: adjustments.to, amount: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  async function add() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await legacyPost("/api/admin/settlements/adjustments", { day: form.day, amount: Number(form.amount), reason: form.reason });
      setForm({ ...form, amount: "", reason: "" });
      setNotice({ kind: "ok", text: "조정을 더했어요." });
      void revalidator.revalidate();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function cancel(id: number) {
    try {
      await legacyPost("/api/admin/settlements/adjustments/" + id + "/cancel");
      setNotice({ kind: "ok", text: "조정을 취소했어요." });
      void revalidator.revalidate();
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    }
  }
  return (
    <Panel title="정산 조정">
      <form
        className="flex flex-col gap-3 border-b border-line px-4 py-4 md:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>정산일</span>
            <input
              type="date"
              className={fieldClass}
              value={form.day}
              onChange={(e) => {
                setForm({ ...form, day: e.target.value });
              }}
            />
            <FieldMessage text={fieldError(error, "day")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>금액 (빼면 -)</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              placeholder="-15000"
              value={form.amount}
              onChange={(e) => {
                setForm({ ...form, amount: e.target.value.replace(/[^0-9-]/g, "") });
              }}
            />
            <FieldMessage text={fieldError(error, "amount")} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>이유</span>
          <input
            className={fieldClass}
            placeholder="택배 파손 보상"
            value={form.reason}
            onChange={(e) => {
              setForm({ ...form, reason: e.target.value });
            }}
          />
          <FieldMessage text={fieldError(error, "reason")} />
        </label>
        {error && !error.fieldErrors && <Notice notice={{ kind: "error", text: errorText(error) }} />}
        <Notice notice={notice} />
        <Button type="submit" size="sm" className="h-10" disabled={busy}>
          {busy ? "더하는 중" : "조정 더하기"}
        </Button>
      </form>
      {adjustments.rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-3 md:px-6">이 기간에 조정이 없어요.</p>
      ) : (
        <ul>
          {adjustments.rows.map((a: any) => (
            <li key={a.id} className={`flex items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 md:px-6 ${a.cancelled ? "opacity-60" : ""}`}>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">
                  {a.dayText} <span className={a.amount < 0 ? "text-danger" : ""}>{krw(a.amount)}</span>
                </span>
                <span className="block text-xs-plus text-ink-2">
                  {a.reason} · {a.createdBy} {a.createdAtText}
                </span>
              </span>
              {a.cancelled ? (
                <Tag tone="muted">취소됨</Tag>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => void cancel(a.id)}>
                  취소
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ---- 결제 내역 ----

const PAYMENT_KEYS = ["from", "to", "status", "coupon", "points", "refund", "min", "max", "email", "page"];

export function paymentsLoader({ request }: LoaderFunctionArgs) {
  const q = queryOf(request, PAYMENT_KEYS);
  return { q: q, result: streamed(legacyGet("/api/admin/payments", q)) };
}

export function PaymentsPage() {
  const { q, result } = useLoaderData<typeof paymentsLoader>();
  return (
    <>
      <PageTitle title="정산" />
      <SettlementTabs />
      <Loaded resolve={result} failure="결제 내역을 불러오지 못했어요" skeleton={<TableSkeleton rows={8} />}>
        {(data: any) => <PaymentsView key={JSON.stringify(q)} data={data} q={q} />}
      </Loaded>
    </>
  );
}

function PaymentsView({ data, q }: { data: any; q: any }) {
  const update = useQueryUpdate();
  const f = data.filters;
  const [form, setForm] = useState<any>({
    from: f.from,
    to: f.to,
    status: f.status || "",
    coupon: f.coupon || "",
    points: f.points || "",
    refund: f.refund || "",
    min: f.min == null ? "" : String(f.min),
    max: f.max == null ? "" : String(f.max),
    email: f.email || "",
  });
  const set = (k: string) => (e: any) => {
    setForm({ ...form, [k]: e.target.value });
  };
  const select = (k: string, options: { v: string; t: string }[]) => (
    <select className={fieldClass} value={form[k]} onChange={set(k)}>
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.t}
        </option>
      ))}
    </select>
  );
  return (
    <div className="flex flex-col gap-3">
      <form
        className="grid grid-cols-2 gap-3 rounded-md border border-line bg-ground p-4 md:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          update({ ...form, page: null });
        }}
      >
        <label className="flex flex-col gap-1">
          <span className={labelClass}>시작일</span>
          <input type="date" className={fieldClass} value={form.from} onChange={set("from")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>종료일</span>
          <input type="date" className={fieldClass} value={form.to} onChange={set("to")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>상태</span>
          {select("status", [
            { v: "", t: "전체" },
            { v: "paid", t: "결제완료" },
            { v: "preparing", t: "배송준비" },
            { v: "shipping", t: "배송중" },
            { v: "delivered", t: "배송완료" },
            { v: "cancelled", t: "취소됨" },
          ])}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>쿠폰</span>
          {select("coupon", [
            { v: "", t: "전체" },
            { v: "yes", t: "쓴 주문" },
            { v: "no", t: "안 쓴 주문" },
          ])}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>포인트</span>
          {select("points", [
            { v: "", t: "전체" },
            { v: "yes", t: "쓴 주문" },
            { v: "no", t: "안 쓴 주문" },
          ])}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>환불</span>
          {select("refund", [{ v: "", t: "전체" }].concat(data.refundOptions.map((o: any) => ({ v: o.value, t: o.label }))))}
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>최소 금액</span>
          <input className={fieldClass} inputMode="numeric" value={form.min} onChange={set("min")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>최대 금액</span>
          <input className={fieldClass} inputMode="numeric" value={form.max} onChange={set("max")} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>고객 이메일</span>
          <input className={fieldClass} value={form.email} onChange={set("email")} />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" size="sm" className="h-10 flex-1">
            조회
          </Button>
          <CsvLink href={csvHref("/api/admin/payments.csv", { ...q, page: undefined })} label="CSV" />
        </div>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="주문" value={comma(data.count) + "건"} />
        <Stat label="주문 금액" value={krw(data.sums.total)} />
        <Stat label="쿠폰·포인트" value={krw(data.sums.couponDiscount + data.sums.pointUsed)} sub={"쿠폰 " + krw(data.sums.couponDiscount)} />
        <Stat label="결제 금액" value={krw(data.sums.paidAmount)} />
        <Stat label="환불" value={krw(data.sums.refundedAmount)} />
      </div>
      <Panel title={"결제 " + comma(data.count) + "건"} aside={<span className="text-xs-plus text-ink-3">{data.page} / {data.pages} 쪽</span>}>
        {data.rows.length === 0 ? (
          <EmptyState title="조건에 맞는 결제가 없어요" hint="조건을 넓혀 보세요" />
        ) : (
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>주문</Th>
                <Th>고객</Th>
                <Th>상태</Th>
                <Th right>주문 금액</Th>
                <Th right>쿠폰</Th>
                <Th right>포인트</Th>
                <Th right>결제 금액</Th>
                <Th right>적립</Th>
                <Th>환불</Th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.orderId} className="border-b border-line last:border-b-0">
                  <Td className="whitespace-nowrap">
                    <span className="block font-bold">{r.orderNumber}</span>
                    <span className="block text-xs text-ink-3">{r.orderedAtText}</span>
                  </Td>
                  <Td className="whitespace-nowrap">{r.customer}</Td>
                  <Td>{r.statusText}</Td>
                  <Td right>
                    <Money value={r.total} />
                  </Td>
                  <Td right>{r.couponDiscount !== 0 ? krw(r.couponDiscount) : "-"}</Td>
                  <Td right>{r.pointUsed > 0 ? comma(r.pointUsed) + "P" : "-"}</Td>
                  <Td right>
                    <Money value={r.paidAmount} strong />
                  </Td>
                  <Td right className="text-ink-2">
                    {comma(r.rewardPoints)}P
                  </Td>
                  <Td>{r.refundStatus === "none" ? <span className="text-ink-3">-</span> : <Tag tone="red">{r.refundText}</Tag>}</Td>
                </tr>
              ))}
            </tbody>
          </TableBox>
        )}
        {data.pages > 1 && (
          <div className="flex items-center justify-center gap-2 border-t border-line py-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => {
                update({ page: data.page - 1 });
              }}
            >
              앞 쪽
            </Button>
            <span className="text-xs-plus text-ink-2">
              {data.page} / {data.pages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={data.page >= data.pages}
              onClick={() => {
                update({ page: data.page + 1 });
              }}
            >
              다음 쪽
            </Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
