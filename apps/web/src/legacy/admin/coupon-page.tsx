// 관리자 쿠폰: 목록, 새 쿠폰 발급, 중지·재개·연장·수량·지정 고객 보내기, 받은 고객·사용 내역
import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { Button } from "../../components/button.tsx";
import { Checkbox } from "../../components/checkbox.tsx";
import { Loaded } from "../../components/loaded.tsx";
import { EmptyState } from "../../components/states.tsx";
import { useAsync } from "../../lib/use-async.ts";
import { streamed } from "../../lib/streamed.ts";
import { csvHref, errorText, fieldError, legacyGet, legacyPost } from "../legacyApi.ts";
import { comma, wonText } from "../money.ts";
import { CsvLink, FieldMessage, Notice, PageTitle, Panel, SegmentTabs, TableBox, TableSkeleton, Tag, Td, Th, fieldClass, labelClass, todayUtc } from "../ui.tsx";

export const COUPON_TONE: any = { active: "green", scheduled: "blue", expired: "muted", exhausted: "gray", paused: "yellow" };

export function adminCouponsLoader() {
  return { result: streamed(Promise.all([legacyGet("/api/admin/coupons"), legacyGet("/api/admin/coupons-ending")])) };
}

export function AdminCouponsPage() {
  const { result } = useLoaderData<typeof adminCouponsLoader>();
  return (
    <Loaded resolve={result} failure="쿠폰을 불러오지 못했어요" skeleton={<TableSkeleton rows={6} />}>
      {([list, ending]: any) => <CouponsView list={list} ending={ending.coupons} />}
    </Loaded>
  );
}

function CouponsView({ list, ending }: { list: any; ending: any[] }) {
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState<any>(null);
  const rows = filter === "all" ? list.coupons : list.coupons.filter((c: any) => (filter === "active" ? c.state === "active" : c.state !== "active"));
  const selected = list.coupons.find((c: any) => c.id === selectedId) || null;
  return (
    <>
      <PageTitle title="쿠폰" count={"전체 " + list.count + "개"}>
        <SegmentTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "전체" },
            { value: "active", label: "사용 가능", count: list.coupons.filter((c: any) => c.state === "active").length },
            { value: "other", label: "그 밖" },
          ]}
        />
        <Button
          size="sm"
          className="h-9"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
          }}
        >
          새 쿠폰
        </Button>
      </PageTitle>
      <div className="mb-3 flex flex-col gap-2">
        <Notice notice={notice} />
        {ending.length > 0 && (
          <p className="rounded-sm bg-status-preparing-bg px-3 py-2 text-xs-plus font-semibold text-status-preparing-text">
            7일 안에 끝나는 쿠폰: {ending.map((c: any) => c.code + "(" + c.endsAtText + ", 안 쓴 " + c.unused + "장)").join(", ")}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <Panel>
          {rows.length === 0 ? (
            <EmptyState title="쿠폰이 없어요" hint="새 쿠폰을 발급해 보세요" />
          ) : (
            <TableBox>
              <thead>
                <tr className="border-b border-line">
                  <Th>코드·이름</Th>
                  <Th right>할인</Th>
                  <Th right>최소 주문</Th>
                  <Th>기간</Th>
                  <Th right>발급/사용</Th>
                  <Th>상태</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c: any) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setSelectedId(c.id);
                      setCreating(false);
                    }}
                    className={`cursor-pointer border-b border-line last:border-b-0 ${selectedId === c.id ? "bg-accent-soft" : ""}`}
                  >
                    <Td>
                      <span className="block font-mono font-bold">{c.code}</span>
                      <span className="block max-w-48 truncate text-xs text-ink-3">{c.name}</span>
                    </Td>
                    <Td right>{wonText(c.discountAmount)}</Td>
                    <Td right>{wonText(c.minOrderAmount)}</Td>
                    <Td className="whitespace-nowrap text-ink-2">{c.endsAtText}</Td>
                    <Td right>
                      {comma(c.issuedCount)}/{comma(c.usedCount)}
                      <span className="block text-xs text-ink-3">한도 {comma(c.issueLimit)}</span>
                    </Td>
                    <Td>
                      <Tag tone={COUPON_TONE[c.state] || "gray"}>{c.stateText}</Tag>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          )}
        </Panel>
        {creating && (
          <CreateCouponPanel
            onClose={() => {
              setCreating(false);
            }}
            onCreated={(text) => {
              setCreating(false);
              setNotice({ kind: "ok", text: text });
            }}
          />
        )}
        {selected && !creating && <CouponDetail key={selected.id} coupon={selected} />}
        {!selected && !creating && (
          <Panel>
            <p className="px-4 py-6 text-sm text-ink-3 md:px-6">쿠폰을 고르면 받은 고객과 사용 내역을 볼 수 있어요.</p>
          </Panel>
        )}
      </div>
    </>
  );
}

function CreateCouponPanel({ onClose, onCreated }: { onClose: () => void; onCreated: (text: string) => void }) {
  const revalidator = useRevalidator();
  const [form, setForm] = useState<any>({ code: "", name: "", discountAmount: "", minOrderAmount: "0", startsAt: todayUtc(), endsAt: "", issueLimit: "100", sendToCustomers: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const field = (name: string, label: string, props: any = {}) => (
    <label className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      <input
        className={fieldClass}
        value={form[name]}
        onChange={(event) => {
          setForm({ ...form, [name]: event.target.value });
        }}
        {...props}
      />
      <FieldMessage text={fieldError(error, name)} />
    </label>
  );
  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await legacyPost("/api/admin/coupons", { ...form, code: String(form.code).toUpperCase() });
      onCreated(r.code + " 쿠폰을 발급했어요" + (r.sent > 0 ? ". 고객 " + r.sent + "명에게 보냈어요." : "."));
      void revalidator.revalidate();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  return (
    <Panel
      title="새 쿠폰"
      aside={
        <Button variant="secondary" size="sm" onClick={onClose}>
          닫기
        </Button>
      }
    >
      <form
        className="flex flex-col gap-3 px-4 py-4 md:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          {field("code", "쿠폰 코드", { placeholder: "DEC3000" })}
          {field("name", "이름", { placeholder: "12월 3,000원 쿠폰" })}
          {field("discountAmount", "할인 금액(원)", { inputMode: "numeric", placeholder: "3000" })}
          {field("minOrderAmount", "최소 주문 금액(원)", { inputMode: "numeric" })}
          {field("startsAt", "시작일", { type: "date" })}
          {field("endsAt", "끝나는 날", { type: "date" })}
          {field("issueLimit", "발급 수량", { inputMode: "numeric" })}
        </div>
        <Checkbox
          visibleLabel
          label="만들면서 고객 지갑에 보내기 (발급 수량까지)"
          checked={form.sendToCustomers}
          onChange={(checked) => {
            setForm({ ...form, sendToCustomers: checked });
          }}
        />
        {error && !error.fieldErrors && <Notice notice={{ kind: "error", text: errorText(error) }} />}
        <Button type="submit" size="sm" className="h-10" disabled={busy}>
          {busy ? "발급하는 중" : "발급하기"}
        </Button>
      </form>
    </Panel>
  );
}

function CouponDetail({ coupon }: { coupon: any }) {
  const revalidator = useRevalidator();
  const [tab, setTab] = useState("holders");
  const [attempt, setAttempt] = useState(0);
  const holders = useAsync("holders:" + coupon.id + ":" + attempt, () => legacyGet("/api/admin/coupons/" + coupon.id + "/holders"));
  const usage = useAsync(tab === "usage" ? "usage:" + coupon.id + ":" + attempt : null, () => legacyGet("/api/admin/coupons/" + coupon.id + "/usage"));
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [endsAt, setEndsAt] = useState("");
  const [limit, setLimit] = useState("");
  const [emails, setEmails] = useState("");
  const [error, setError] = useState<any>(null);

  async function act(path: string, body: any, okText: (r: any) => string) {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const r = await legacyPost("/api/admin/coupons/" + coupon.id + path, body);
      setNotice({ kind: "ok", text: okText(r) });
      setAttempt(attempt + 1);
      void revalidator.revalidate();
    } catch (e) {
      setError(e);
      setNotice({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={<span className="font-mono">{coupon.code}</span>} aside={<Tag tone={COUPON_TONE[coupon.state] || "gray"}>{coupon.stateText}</Tag>}>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 md:px-6">
        <p className="text-sm text-ink-2">
          {coupon.name} · {wonText(coupon.discountAmount)} 할인 · {wonText(coupon.minOrderAmount)} 이상 · {coupon.endsAtText}
        </p>
        <Notice notice={notice} />
        <div className="flex flex-wrap gap-2">
          {coupon.state === "paused" ? (
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act("/resume", {}, () => "다시 쓸 수 있게 했어요.")}>
              다시 쓰게 하기
            </Button>
          ) : (
            <Button variant="secondary" size="sm" disabled={busy || coupon.state === "expired"} onClick={() => void act("/pause", {}, () => "쿠폰을 멈췄어요. 고객이 쓸 수 없어요.")}>
              잠시 멈추기
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>끝나는 날 늦추기</span>
            <span className="flex gap-1">
              <input
                type="date"
                className={fieldClass}
                value={endsAt}
                onChange={(e) => {
                  setEndsAt(e.target.value);
                }}
              />
              <Button variant="secondary" size="sm" className="h-10" disabled={busy || endsAt === ""} onClick={() => void act("/extend", { endsAt: endsAt }, (r) => r.endsAtText + "로 바꿨어요.")}>
                저장
              </Button>
            </span>
            <FieldMessage text={fieldError(error, "endsAt")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>발급 수량 늘리기</span>
            <span className="flex gap-1">
              <input
                className={fieldClass}
                inputMode="numeric"
                placeholder={String(coupon.issueLimit)}
                value={limit}
                onChange={(e) => {
                  setLimit(e.target.value.replace(/[^0-9]/g, ""));
                }}
              />
              <Button variant="secondary" size="sm" className="h-10" disabled={busy || limit === ""} onClick={() => void act("/limit", { issueLimit: Number(limit) }, (r) => "발급 수량을 " + comma(r.issueLimit) + "장으로 늘렸어요.")}>
                저장
              </Button>
            </span>
            <FieldMessage text={fieldError(error, "issueLimit")} />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={labelClass}>지정 고객에게 보내기 (이메일, 한 줄에 하나)</span>
          <textarea
            className="min-h-16 w-full rounded-md border border-ink-3 bg-ground p-2 text-sm text-ink"
            value={emails}
            onChange={(e) => {
              setEmails(e.target.value);
            }}
          />
          <FieldMessage text={fieldError(error, "emails")} />
        </label>
        <Button
          size="sm"
          className="h-9 self-start"
          disabled={busy || emails.trim() === ""}
          onClick={() =>
            void act("/send", { emails: emails }, (r) => {
              setEmails("");
              return r.sent + "명에게 보냈어요" + (r.skipped.length > 0 ? ". 건너뜀: " + r.skipped.map((s: any) => s.email + "(" + s.reason + ")").join(", ") : ".");
            })
          }
        >
          보내기
        </Button>
      </div>
      <div className="flex items-center justify-between px-4 pt-3 md:px-6">
        <SegmentTabs
          value={tab}
          onChange={setTab}
          options={[
            { value: "holders", label: "받은 고객", count: holders.status === "ready" ? holders.data.holders.length : null },
            { value: "usage", label: "사용 내역" },
          ]}
        />
        <CsvLink href={csvHref("/api/admin/coupons/" + coupon.id + "/holders.csv")} label="CSV" />
      </div>
      <div className="max-h-96 overflow-y-auto">
        {tab === "holders" && holders.status === "ready" && (
          <ul className="py-2">
            {holders.data.holders.length === 0 && <li className="px-4 py-3 text-sm text-ink-3 md:px-6">아직 받은 고객이 없어요.</li>}
            {holders.data.holders.map((h: any) => (
              <li key={h.userId} className="flex items-center justify-between px-4 py-2 text-sm md:px-6">
                <span>{h.customer}</span>
                <span className="text-xs text-ink-3">{h.used ? h.usedAtText + " 사용" : h.receivedAtText + " 받음"}</span>
              </li>
            ))}
          </ul>
        )}
        {tab === "usage" && usage.status === "ready" && (
          <ul className="py-2">
            {usage.data.redemptions.length === 0 && <li className="px-4 py-3 text-sm text-ink-3 md:px-6">아직 쓴 주문이 없어요.</li>}
            {usage.data.redemptions.map((r: any) => (
              <li key={r.orderNumber} className="flex items-center justify-between px-4 py-2 text-sm md:px-6">
                <span>
                  {r.orderNumber} <span className="text-ink-3">{r.customerName}</span>
                </span>
                <span className="flex items-center gap-2">
                  {wonText(r.discount)}
                  {r.state === "restored" && <Tag tone="muted">취소로 되돌림</Tag>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {((tab === "holders" && holders.status === "loading") || (tab === "usage" && usage.status === "loading")) && <p className="px-4 py-3 text-sm text-ink-3 md:px-6">불러오는 중이에요.</p>}
        {((tab === "holders" && holders.status === "error") || (tab === "usage" && usage.status === "error")) && <p className="px-4 py-3 text-sm text-danger md:px-6">불러오지 못했어요.</p>}
      </div>
    </Panel>
  );
}
