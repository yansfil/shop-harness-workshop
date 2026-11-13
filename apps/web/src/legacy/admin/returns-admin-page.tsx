// 관리자 반품·교환: 승인·거절(줄 안에서 확인), 교환 상품 다시 보내기, 사유 통계
import { useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { Button } from "../../components/button.tsx";
import { Loaded } from "../../components/loaded.tsx";
import { EmptyState } from "../../components/states.tsx";
import { krw } from "../../lib/format.ts";
import { useAsync } from "../../lib/use-async.ts";
import { streamed } from "../../lib/streamed.ts";
import { errorText, legacyGet, legacyPost } from "../legacyApi.ts";
import { RETURN_TONE } from "../returns-pages.tsx";
import { Notice, PageTitle, Panel, SegmentTabs, Stat, TableBox, TableSkeleton, Tag, Td, Th, fieldClass } from "../ui.tsx";

const STATES = ["requested", "approved", "rejected", "withdrawn"];

export function adminReturnsLoader({ request }: LoaderFunctionArgs) {
  const s = new URL(request.url).searchParams.get("state") || "requested";
  const state = STATES.indexOf(s) >= 0 ? s : "requested";
  return { state: state, result: streamed(legacyGet("/api/admin/returns", { state: state })) };
}

export function AdminReturnsPage() {
  const { state, result } = useLoaderData<typeof adminReturnsLoader>();
  const navigate = useNavigate();
  const [panel, setPanel] = useState("list");
  return (
    <>
      <PageTitle title="반품·교환">
        <SegmentTabs
          value={panel}
          onChange={setPanel}
          options={[
            { value: "list", label: "신청" },
            { value: "reship", label: "교환 발송" },
            { value: "stats", label: "사유 통계" },
          ]}
        />
      </PageTitle>
      {panel === "list" && (
        <Loaded resolve={result} failure="신청을 불러오지 못했어요" skeleton={<TableSkeleton rows={6} />}>
          {(data: any) => (
            <ReturnList
              key={state}
              data={data}
              onState={(s) => {
                void navigate("?state=" + s);
              }}
            />
          )}
        </Loaded>
      )}
      {panel === "reship" && <ReshipPanel />}
      {panel === "stats" && <StatsPanel />}
    </>
  );
}

function ReturnList({ data, onState }: { data: any; onState: (s: string) => void }) {
  const revalidator = useRevalidator();
  const [notice, setNotice] = useState<any>(null);
  return (
    <div className="flex flex-col gap-3">
      <SegmentTabs
        value={data.state}
        onChange={onState}
        options={[
          { value: "requested", label: "승인 대기", count: data.counts.requested },
          { value: "approved", label: "승인됨", count: data.counts.approved },
          { value: "rejected", label: "거절됨", count: data.counts.rejected },
          { value: "withdrawn", label: "고객 취소", count: data.counts.withdrawn },
        ]}
      />
      <Notice notice={notice} />
      <Panel>
        {data.requests.length === 0 ? (
          <EmptyState title={data.state === "requested" ? "기다리는 신청이 없어요" : "신청이 없어요"} />
        ) : (
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>신청</Th>
                <Th>고객</Th>
                <Th>상품</Th>
                <Th>사유</Th>
                <Th right>환불</Th>
                <Th>{data.state === "requested" ? "처리" : "상태"}</Th>
              </tr>
            </thead>
            <tbody>
              {data.requests.map((r: any) => (
                <tr key={r.id} className="border-b border-line align-top last:border-b-0">
                  <Td className="whitespace-nowrap">
                    <span className="flex items-center gap-1 font-bold">
                      {r.requestNo} <Tag tone={r.kind === "exchange" ? "blue" : "gray"}>{r.kindText}</Tag>
                    </span>
                    <span className="block text-xs text-ink-3">
                      {r.shortOrderNumber} · {r.createdAtText}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">{r.customer}</Td>
                  <Td>
                    <span className="block max-w-48 truncate">{r.itemSummary}</span>
                  </Td>
                  <Td>
                    <span className="block">{r.reasonText}</span>
                    {r.detail && <span className="block max-w-56 truncate text-xs text-ink-3">{r.detail}</span>}
                  </Td>
                  <Td right>{r.kind === "return" ? krw(r.refundAmount) : "-"}</Td>
                  <Td>
                    {r.state === "requested" ? (
                      <DecideInline
                        request={r}
                        onDone={(text) => {
                          setNotice({ kind: "ok", text: text });
                          void revalidator.revalidate();
                        }}
                      />
                    ) : (
                      <span className="flex flex-col gap-1">
                        <Tag tone={RETURN_TONE[r.state] || "gray"}>{r.stateText}</Tag>
                        {r.rejectReason && <span className="max-w-48 text-xs text-ink-3">{r.rejectReason}</span>}
                        {r.decidedAtText && <span className="text-xs text-ink-3">{r.decidedAtText}</span>}
                      </span>
                    )}
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

/** 승인·거절을 줄 안에서 한 번 더 묻는다 */
function DecideInline({ request, onDone }: { request: any; onDone: (text: string) => void }) {
  const [mode, setMode] = useState<"idle" | "approve" | "reject">("idle");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "approve") {
        await legacyPost("/api/admin/returns/" + request.id + "/approve");
        onDone(request.requestNo + " 승인했어요." + (request.kind === "return" ? " " + krw(request.refundAmount) + " 환불, 재고를 되돌렸어요." : " 교환 발송에서 송장을 넣어 주세요."));
      } else {
        await legacyPost("/api/admin/returns/" + request.id + "/reject", { reason: reason });
        onDone(request.requestNo + " 거절했어요.");
      }
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  if (mode === "idle") {
    return (
      <span className="flex gap-1">
        <Button
          size="sm"
          onClick={() => {
            setMode("approve");
          }}
        >
          승인
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setMode("reject");
          }}
        >
          거절
        </Button>
      </span>
    );
  }
  return (
    <span className="flex w-60 flex-col gap-1 rounded-sm bg-accent-soft p-2">
      <span className="text-xs-plus font-bold text-ink">
        {mode === "approve" ? (request.kind === "return" ? krw(request.refundAmount) + " 환불하고 재고를 되돌릴까요?" : "교환을 승인할까요?") : "거절 이유를 적어 주세요"}
      </span>
      {mode === "reject" && (
        <input
          aria-label="거절 이유"
          className={`${fieldClass} h-8 text-xs-plus`}
          placeholder="사진으로 손상을 확인하지 못했어요"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      )}
      {error && <span className="text-xs font-semibold text-danger">{error}</span>}
      <span className="flex gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => {
            setMode("idle");
          }}
        >
          아니요
        </Button>
        <Button size="sm" disabled={busy} onClick={() => void decide()}>
          {busy ? "처리 중" : mode === "approve" ? "승인" : "거절"}
        </Button>
      </span>
    </span>
  );
}

function ReshipPanel() {
  const [attempt, setAttempt] = useState(0);
  const list = useAsync("reship:" + attempt, () => Promise.all([legacyGet("/api/admin/exchanges/to-ship"), legacyGet("/api/admin/shipments/couriers")]));
  const [notice, setNotice] = useState<any>(null);
  if (list.status === "loading" || list.status === "idle") return <TableSkeleton rows={3} />;
  if (list.status === "error") return <Notice notice={{ kind: "error", text: errorText(list.error) }} />;
  const [data, couriers]: any = list.data;
  return (
    <div className="flex flex-col gap-3">
      <Notice notice={notice} />
      <Panel title={"보낼 교환 상품 " + data.requests.length + "건"}>
        {data.requests.length === 0 ? (
          <EmptyState title="보낼 교환 상품이 없어요" hint="교환을 승인하면 여기에 보여요" />
        ) : (
          <ul>
            {data.requests.map((r: any) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 md:px-6">
                <span className="min-w-0">
                  <b className="block text-sm font-bold text-ink">
                    {r.requestNo} · {r.itemSummary}
                  </b>
                  <span className="block text-xs-plus text-ink-3">
                    {r.customer} · {r.shortOrderNumber} · {r.decidedAtText} 승인
                  </span>
                </span>
                <ReshipForm
                  request={r}
                  couriers={couriers.couriers}
                  onDone={(text) => {
                    setNotice({ kind: "ok", text: text });
                    setAttempt(attempt + 1);
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function ReshipForm({ request, couriers, onDone }: { request: any; couriers: any[]; onDone: (text: string) => void }) {
  const [courier, setCourier] = useState(couriers[0] ? couriers[0].code : "SB");
  const [trackingNo, setTrackingNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setError(null);
    try {
      await legacyPost("/api/admin/exchanges/" + request.id + "/ship", { courierCode: courier, trackingNo: trackingNo });
      onDone(request.requestNo + " 교환 상품을 보냈어요. 고객에게 알림이 가요.");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="flex gap-1">
        <select
          aria-label="택배사"
          className={`${fieldClass} h-8 w-32 text-xs-plus`}
          value={courier}
          onChange={(e) => {
            setCourier(e.target.value);
          }}
        >
          {couriers.map((c: any) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          aria-label="송장 번호"
          className={`${fieldClass} h-8 w-44 font-mono text-xs-plus`}
          placeholder={courier + "-0000-0000-0000"}
          value={trackingNo}
          onChange={(e) => {
            setTrackingNo(e.target.value.toUpperCase());
          }}
        />
        <Button size="sm" disabled={busy || trackingNo === ""} onClick={() => void send()}>
          보내기
        </Button>
      </span>
      {error && <span className="text-xs font-semibold text-danger">{error}</span>}
    </span>
  );
}

function StatsPanel() {
  const stats = useAsync("return-stats", () => legacyGet("/api/admin/return-stats"));
  if (stats.status === "loading" || stats.status === "idle") return <TableSkeleton rows={4} />;
  if (stats.status === "error") return <Notice notice={{ kind: "error", text: errorText(stats.error) }} />;
  const s = stats.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="신청" value={s.total + "건"} sub={s.from + " ~ " + s.to} />
        <Stat label="승인 비율" value={s.approvedRateText} />
        <Stat label="반품 환불" value={krw(s.refundAmount)} />
        <Stat label="처리까지 평균" value={s.averageDecisionText} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="사유별">
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>사유</Th>
                <Th right>반품</Th>
                <Th right>교환</Th>
                <Th right>대기</Th>
                <Th right>비중</Th>
              </tr>
            </thead>
            <tbody>
              {s.reasons.map((r: any) => (
                <tr key={r.code} className="border-b border-line last:border-b-0">
                  <Td>{r.text}</Td>
                  <Td right>{r.returns}</Td>
                  <Td right>{r.exchanges}</Td>
                  <Td right>{r.waiting}</Td>
                  <Td right className="text-ink-2">
                    {r.shareText}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableBox>
        </Panel>
        <Panel title="신청이 많은 상품">
          {s.products.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-3 md:px-6">신청이 없어요.</p>
          ) : (
            <TableBox>
              <tbody>
                {s.products.map((p: any) => (
                  <tr key={p.productId} className="border-b border-line last:border-b-0">
                    <Td>{p.name}</Td>
                    <Td right>{p.requests}건</Td>
                    <Td right className="text-ink-2">
                      {p.quantity}개
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          )}
        </Panel>
      </div>
    </div>
  );
}
