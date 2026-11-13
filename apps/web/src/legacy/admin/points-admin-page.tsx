// 관리자 포인트: 현황, 고객 찾기·조정, 지급 행사, 원장 CSV
import { useState } from "react";
import { useLoaderData, useRevalidator } from "react-router";
import { Button } from "../../components/button.tsx";
import { Loaded } from "../../components/loaded.tsx";
import { useAsync } from "../../lib/use-async.ts";
import { streamed } from "../../lib/streamed.ts";
import { csvHref, errorText, fieldError, legacyGet, legacyPost } from "../legacyApi.ts";
import { pointText, signedPoint } from "../money.ts";
import { CsvLink, FieldMessage, Notice, PageTitle, Panel, SegmentTabs, Stat, TableBox, TableSkeleton, Tag, Td, Th, fieldClass, labelClass } from "../ui.tsx";

export function adminPointsLoader() {
  return { result: streamed(Promise.all([legacyGet("/api/admin/points/summary"), legacyGet("/api/admin/point-campaigns")])) };
}

export function AdminPointsPage() {
  const { result } = useLoaderData<typeof adminPointsLoader>();
  return (
    <Loaded resolve={result} failure="포인트를 불러오지 못했어요" skeleton={<TableSkeleton rows={6} />}>
      {([summary, campaigns]: any) => (
        <>
          <PageTitle title="포인트">
            <CsvLink href={csvHref("/api/admin/point-ledger.csv")} label="최근 30일 원장 CSV" />
          </PageTitle>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="고객이 가진 포인트 전체" value={pointText(summary.outstanding)} sub="1P = 1원" />
            <Stat label="지급 행사" value={campaigns.campaigns.length + "번"} />
          </div>
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start">
            <MemberPanel holders={summary.holders} />
            <CampaignPanel campaigns={campaigns.campaigns} maxPoints={campaigns.maxPoints} />
          </div>
        </>
      )}
    </Loaded>
  );
}

function MemberPanel({ holders }: { holders: any[] }) {
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [memberId, setMemberId] = useState<number | null>(null);
  const found = useAsync(query.length >= 2 ? "members:" + query : null, () => legacyGet("/api/admin/point-members", { q: query }));
  const list = query.length >= 2 ? (found.status === "ready" ? found.data.members : []) : holders.map((h: any) => ({ id: h.id, label: h.user, balanceText: pointText(h.balance), name: h.name }));
  return (
    <Panel title="고객 포인트">
      <form
        className="flex gap-2 border-b border-line px-4 py-3 md:px-6"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(keyword.trim());
        }}
      >
        <input
          className={fieldClass}
          placeholder="이메일 또는 이름 (두 글자 이상)"
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
          }}
        />
        <Button type="submit" variant="secondary" size="sm" className="h-10 shrink-0">
          찾기
        </Button>
      </form>
      {query.length < 2 && <p className="px-4 pt-3 text-xs-plus text-ink-3 md:px-6">포인트가 많은 고객 20명</p>}
      {found.status === "ready" && found.data.message && <p className="px-4 pt-3 text-xs-plus text-ink-3 md:px-6">{found.data.message}</p>}
      <ul className="max-h-72 overflow-y-auto py-2">
        {list.map((m: any, index: number) => (
          <li key={m.id ?? index}>
            <button
              type="button"
              disabled={m.id === null}
              onClick={() => {
                setMemberId(m.id);
              }}
              className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm md:px-6 ${memberId !== null && memberId === m.id ? "bg-accent-soft font-bold" : ""}`}
            >
              <span>{m.label}</span>
              <span className="text-ink-2">{m.balanceText}</span>
            </button>
          </li>
        ))}
      </ul>
      {memberId !== null && <MemberDetail key={memberId} memberId={memberId} />}
    </Panel>
  );
}

function MemberDetail({ memberId }: { memberId: number }) {
  const [attempt, setAttempt] = useState(0);
  const detail = useAsync("member:" + memberId + ":" + attempt, () => legacyGet("/api/admin/points/" + memberId));
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  async function adjust() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await legacyPost("/api/admin/points/" + memberId + "/adjust", { amount: Number(amount), memo: memo });
      setNotice({ kind: "ok", text: "조정했어요. 잔액 " + pointText(r.balance) });
      setAmount("");
      setMemo("");
      setAttempt(attempt + 1);
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  if (detail.status !== "ready") return <p className="border-t border-line px-4 py-4 text-sm text-ink-3 md:px-6">{detail.status === "error" ? "불러오지 못했어요." : "불러오는 중이에요."}</p>;
  const d = detail.data;
  return (
    <div className="border-t border-line">
      <div className="flex flex-col gap-2 px-4 py-4 md:px-6">
        <p className="flex items-center justify-between">
          <b className="text-sm font-extrabold text-ink">{d.user ? d.user.label : ""}</b>
          <span className="text-lg font-extrabold text-ink">{pointText(d.balance)}</span>
        </p>
        <div className="flex gap-2">
          <input
            className={`${fieldClass} w-32`}
            inputMode="numeric"
            placeholder="+1000 / -500"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9-]/g, ""));
            }}
          />
          <input
            className={fieldClass}
            placeholder="메모 (예: 배송 지연 보상)"
            value={memo}
            onChange={(e) => {
              setMemo(e.target.value);
            }}
          />
          <Button size="sm" className="h-10 shrink-0" disabled={busy || amount === "" || amount === "-"} onClick={() => void adjust()}>
            조정
          </Button>
        </div>
        <Notice notice={notice} />
      </div>
      <div className="max-h-64 overflow-y-auto border-t border-line">
        <TableBox>
          <tbody>
            {d.history.slice(0, 50).map((h: any) => (
              <tr key={h.id} className="border-b border-line last:border-b-0">
                <Td className="whitespace-nowrap text-xs text-ink-3">{h.createdAtText}</Td>
                <Td className="text-xs">{h.description}</Td>
                <Td right className="text-xs font-bold">
                  {signedPoint(h.amount)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      </div>
    </div>
  );
}

function CampaignPanel({ campaigns, maxPoints }: { campaigns: any[]; maxPoints: number }) {
  const revalidator = useRevalidator();
  const [form, setForm] = useState<any>({ title: "", points: "", target: "list", emails: "" });
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  async function check() {
    setBusy(true);
    setError(null);
    try {
      setPreview(await legacyPost("/api/admin/point-campaigns/preview", { ...form, points: Number(form.points) }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function grant() {
    setBusy(true);
    setError(null);
    try {
      const r = await legacyPost("/api/admin/point-campaigns", { ...form, points: Number(form.points) });
      setNotice({ kind: "ok", text: r.memberCount + "명에게 " + r.pointsText + "씩 줬어요." });
      setPreview(null);
      setForm({ title: "", points: "", target: "list", emails: "" });
      void revalidator.revalidate();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const change = (k: string, v: any) => {
    setForm({ ...form, [k]: v });
    setPreview(null);
  };
  return (
    <Panel title="포인트 지급 행사">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 md:px-6">
        <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>행사 이름</span>
            <input
              className={fieldClass}
              placeholder="가을 감사 적립"
              value={form.title}
              onChange={(e) => {
                change("title", e.target.value);
              }}
            />
            <FieldMessage text={fieldError(error, "title")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>1인당 포인트</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              placeholder={"최대 " + maxPoints}
              value={form.points}
              onChange={(e) => {
                change("points", e.target.value.replace(/[^0-9]/g, ""));
              }}
            />
            <FieldMessage text={fieldError(error, "points")} />
          </label>
        </div>
        <SegmentTabs
          value={form.target}
          onChange={(v) => {
            change("target", v);
          }}
          options={[
            { value: "list", label: "지정 고객" },
            { value: "all", label: "전체 고객" },
          ]}
        />
        {form.target === "list" && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>고객 이메일 (한 줄에 하나)</span>
            <textarea
              className="min-h-20 w-full rounded-md border border-ink-3 bg-ground p-2 text-sm text-ink"
              value={form.emails}
              onChange={(e) => {
                change("emails", e.target.value);
              }}
            />
            <FieldMessage text={fieldError(error, "emails")} />
          </label>
        )}
        {error && !error.fieldErrors && <Notice notice={{ kind: "error", text: errorText(error) }} />}
        <Notice notice={notice} />
        {preview ? (
          <div className="rounded-sm bg-accent-soft p-3 text-sm">
            <p className="font-bold text-ink">
              {preview.memberCount}명 · 모두 {pointText(preview.totalPoints)}
            </p>
            {preview.skipped.length > 0 && <p className="mt-1 text-xs text-ink-2">건너뛸 이메일: {preview.skipped.join(", ")}</p>}
            <p className="mt-1 text-xs text-ink-3">지급한 포인트는 1년 뒤 사라지고, 고객에게 알림이 가요.</p>
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPreview(null);
                }}
              >
                고치기
              </Button>
              <Button size="sm" disabled={busy || preview.memberCount === 0} onClick={() => void grant()}>
                {busy ? "지급하는 중" : "지급하기"}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" size="sm" className="h-9 self-start" disabled={busy || form.points === ""} onClick={() => void check()}>
            대상 확인
          </Button>
        )}
      </div>
      {campaigns.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink-3 md:px-6">아직 지급한 행사가 없어요.</p>
      ) : (
        <TableBox>
          <thead>
            <tr className="border-b border-line">
              <Th>행사</Th>
              <Th>대상</Th>
              <Th right>인원</Th>
              <Th right>합계</Th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c: any) => (
              <tr key={c.id} className="border-b border-line last:border-b-0">
                <Td>
                  <span className="block font-bold">{c.title}</span>
                  <span className="block text-xs text-ink-3">
                    {c.createdAtText} · {c.pointsText}씩
                  </span>
                </Td>
                <Td>
                  <Tag tone={c.target === "all" ? "blue" : "gray"}>{c.targetText}</Tag>
                </Td>
                <Td right>{c.memberCount}</Td>
                <Td right>{pointText(c.totalPoints)}</Td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      )}
    </Panel>
  );
}
