// 관리자 배송: 송장 등록(한 건·한꺼번에), 배송 현황, 지연, 택배사별, CSV
import { useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { Button } from "../../components/button.tsx";
import { Loaded } from "../../components/loaded.tsx";
import { EmptyState } from "../../components/states.tsx";
import { StatusBadge } from "../../components/status-badge.tsx";
import { useAsync } from "../../lib/use-async.ts";
import { streamed } from "../../lib/streamed.ts";
import { csvHref, errorText, legacyGet, legacyPost } from "../legacyApi.ts";
import { comma } from "../money.ts";
import { CsvLink, Notice, PageTitle, Panel, SegmentTabs, Stat, TableBox, TableSkeleton, Tag, Td, Th, fieldClass } from "../ui.tsx";

const TABS = ["preparing", "shipping", "delivered"];

export function adminShipmentsLoader({ request }: LoaderFunctionArgs) {
  const tab = new URL(request.url).searchParams.get("status") || "preparing";
  const status = TABS.indexOf(tab) >= 0 ? tab : "preparing";
  return { status: status, result: streamed(legacyGet("/api/admin/shipments", { status: status })) };
}

export function AdminShipmentsPage() {
  const { status, result } = useLoaderData<typeof adminShipmentsLoader>();
  const navigate = useNavigate();
  const [panel, setPanel] = useState("board");
  return (
    <>
      <PageTitle title="배송">
        <SegmentTabs
          value={panel}
          onChange={setPanel}
          options={[
            { value: "board", label: "송장·현황" },
            { value: "bulk", label: "한꺼번에 등록" },
            { value: "delays", label: "지연" },
            { value: "couriers", label: "택배사별" },
          ]}
        />
        <CsvLink href={csvHref("/api/admin/shipments.csv")} label="최근 7일 송장 CSV" />
      </PageTitle>
      {panel === "board" && (
        <Loaded resolve={result} failure="배송 현황을 불러오지 못했어요" skeleton={<TableSkeleton rows={8} />}>
          {(board: any) => (
            <Board
              key={status}
              board={board}
              onTab={(t) => {
                void navigate("?status=" + t);
              }}
            />
          )}
        </Loaded>
      )}
      {panel === "bulk" && <BulkPanel />}
      {panel === "delays" && <DelaysPanel />}
      {panel === "couriers" && <CouriersPanel />}
    </>
  );
}

function Board({ board, onTab }: { board: any; onTab: (t: string) => void }) {
  const revalidator = useRevalidator();
  const [notice, setNotice] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  async function sync() {
    setSyncing(true);
    try {
      const r = await legacyPost("/api/admin/shipments/sync");
      setNotice({ kind: "ok", text: "택배사에 물어봤어요. 배송완료 " + r.delivered + "건, 배송중 " + r.inTransit + "건." });
      void revalidator.revalidate();
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    } finally {
      setSyncing(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentTabs
          value={board.tab}
          onChange={onTab}
          options={[
            { value: "preparing", label: "배송준비", count: board.counts.preparing },
            { value: "shipping", label: "배송중", count: board.counts.shipping },
            { value: "delivered", label: "배송완료", count: board.counts.delivered },
          ]}
        />
        <Button variant="secondary" size="sm" disabled={syncing} onClick={() => void sync()}>
          {syncing ? "확인하는 중" : "배송 상태 지금 확인"}
        </Button>
      </div>
      <Notice notice={notice} />
      <Panel>
        {board.rows.length === 0 ? (
          <EmptyState title={board.tab === "preparing" ? "송장을 기다리는 주문이 없어요" : "주문이 없어요"} hint={board.tab === "preparing" ? "주문 화면에서 배송준비로 넘기면 여기에 보여요" : undefined} />
        ) : (
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>주문</Th>
                <Th>고객</Th>
                <Th>상품</Th>
                <Th>상태</Th>
                <Th>{board.tab === "preparing" ? "송장 등록" : "송장"}</Th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((r: any) => (
                <tr key={r.orderId} className="border-b border-line last:border-b-0">
                  <Td className="whitespace-nowrap">
                    <span className="block font-bold">{r.shortOrderNumber}</span>
                    <span className="block text-xs text-ink-3">{r.orderedAtText}</span>
                  </Td>
                  <Td className="whitespace-nowrap">{r.customer}</Td>
                  <Td>
                    <span className="block max-w-56 truncate">{r.itemSummary}</span>
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td>
                    {r.shipment ? (
                      <span className="text-xs-plus whitespace-nowrap text-ink-2">
                        {r.shipment.courierName} {r.shipment.trackingNo}
                        <span className="block text-xs text-ink-3">{r.shipment.deliveredAtText ? r.shipment.deliveredAtText + " 도착" : r.shipment.registeredAtText + " 등록"}</span>
                      </span>
                    ) : (
                      <RegisterInline
                        row={r}
                        couriers={board.couriers}
                        onDone={(text) => {
                          setNotice({ kind: "ok", text: text });
                          void revalidator.revalidate();
                        }}
                      />
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

function RegisterInline({ row, couriers, onDone }: { row: any; couriers: any[]; onDone: (text: string) => void }) {
  const [courier, setCourier] = useState(couriers[0] ? couriers[0].code : "SB");
  const [trackingNo, setTrackingNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function suggest(code: string) {
    try {
      const r = await legacyGet("/api/admin/shipments/couriers", { courier: code });
      setTrackingNo(r.suggestedTrackingNo);
    } catch {
      setTrackingNo("");
    }
  }
  async function register() {
    setBusy(true);
    setError(null);
    try {
      await legacyPost("/api/admin/shipments", { orderId: row.orderId, courierCode: courier, trackingNo: trackingNo });
      onDone(row.shortOrderNumber + " 송장을 등록했어요. 배송중으로 넘어갔어요.");
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        <select
          aria-label="택배사"
          className={`${fieldClass} h-8 w-32 text-xs-plus`}
          value={courier}
          onChange={(e) => {
            setCourier(e.target.value);
            void suggest(e.target.value);
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
          onFocus={() => {
            if (trackingNo === "") void suggest(courier);
          }}
          onChange={(e) => {
            setTrackingNo(e.target.value.toUpperCase());
          }}
        />
        <Button size="sm" disabled={busy || trackingNo === ""} onClick={() => void register()}>
          등록
        </Button>
      </div>
      {error && <span className="text-xs font-semibold text-danger">{error}</span>}
    </div>
  );
}

function BulkPanel() {
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function check() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setChecked(await legacyPost("/api/admin/shipments/bulk/check", { text: text }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function register() {
    setBusy(true);
    setError(null);
    try {
      const r = await legacyPost("/api/admin/shipments/bulk", { text: text });
      setResult(r);
      setChecked(null);
      setText("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const rows = result ? result.rows : checked ? checked.rows : [];
  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
      <Panel title="붙여 넣기">
        <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
          <p className="text-xs-plus text-ink-2">엑셀에서 주문번호, 택배사, 송장번호 세 칸을 복사해 붙여 넣으세요. 택배사는 SB·HU·DO 또는 이름으로 적어요.</p>
          <textarea
            aria-label="송장 목록"
            className="min-h-48 w-full rounded-md border border-ink-3 bg-ground p-3 font-mono text-xs-plus text-ink"
            placeholder={"GM-20261113-0001,SB,SB-5521-0087-6401\nGM-20261113-0002,한울택배,HU-5521-0087-6402"}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setChecked(null);
            }}
          />
          {error && <Notice notice={{ kind: "error", text: error }} />}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="h-10" disabled={busy || text.trim() === ""} onClick={() => void check()}>
              검사
            </Button>
            <Button size="sm" className="h-10" disabled={busy || !checked || checked.okCount === 0} onClick={() => void register()}>
              {checked ? checked.okCount + "건 등록" : "등록"}
            </Button>
          </div>
        </div>
      </Panel>
      <Panel
        title={result ? "등록 결과" : "검사 결과"}
        aside={
          result ? (
            <span className="text-xs-plus text-ink-2">
              등록 {result.registered}건 · 실패 {result.failed}건
            </span>
          ) : checked ? (
            <span className="text-xs-plus text-ink-2">
              등록 가능 {checked.okCount}건 · 문제 {checked.problemCount}건
            </span>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3 md:px-6">붙여 넣고 검사하면 줄마다 결과가 보여요.</p>
        ) : (
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>줄</Th>
                <Th>주문번호</Th>
                <Th>택배사</Th>
                <Th>송장 번호</Th>
                <Th>결과</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.line} className="border-b border-line last:border-b-0">
                  <Td className="text-ink-3">{r.line}</Td>
                  <Td className="font-mono text-xs-plus">{r.orderNumber}</Td>
                  <Td>{r.courierName}</Td>
                  <Td className="font-mono text-xs-plus">{r.trackingNo}</Td>
                  <Td>
                    {r.registered ? <Tag tone="green">등록됨</Tag> : r.ok ? <Tag tone="blue">등록 가능</Tag> : <span className="text-xs-plus font-semibold text-danger">{r.problem}</span>}
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

function DelaysPanel() {
  const delays = useAsync("delays", () => legacyGet("/api/admin/shipments/delays"));
  if (delays.status === "loading" || delays.status === "idle") return <TableSkeleton rows={4} />;
  if (delays.status === "error") return <Notice notice={{ kind: "error", text: errorText(delays.error) }} />;
  const d = delays.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="출고 지연" value={d.waiting.length + "건"} sub={d.shipWithinText} />
        <Stat label="배송 지연" value={d.late.length + "건"} sub="예상 시간의 두 배가 지난 송장" />
      </div>
      <Panel title="출고 지연">
        {d.waiting.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ink-3 md:px-6">늦어진 출고가 없어요.</p>
        ) : (
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>주문</Th>
                <Th>고객</Th>
                <Th>상태</Th>
                <Th>출고 기한</Th>
                <Th right>늦어진 영업일</Th>
              </tr>
            </thead>
            <tbody>
              {d.waiting.map((w: any) => (
                <tr key={w.orderId} className="border-b border-line last:border-b-0">
                  <Td>
                    <span className="block font-bold">{w.orderNumber}</span>
                    <span className="block text-xs text-ink-3">{w.orderedAtText}</span>
                  </Td>
                  <Td>{w.customer}</Td>
                  <Td>
                    <StatusBadge status={w.status} />
                  </Td>
                  <Td>{w.deadlineText}</Td>
                  <Td right className="font-bold text-danger">
                    {w.lateBusinessDays}일
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableBox>
        )}
      </Panel>
      <Panel title="배송 지연">
        {d.late.length === 0 ? (
          <p className="px-4 py-5 text-sm text-ink-3 md:px-6">늦어진 배송이 없어요.</p>
        ) : (
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>주문</Th>
                <Th>고객</Th>
                <Th>송장</Th>
                <Th>등록</Th>
                <Th right>지난 시간</Th>
              </tr>
            </thead>
            <tbody>
              {d.late.map((l: any) => (
                <tr key={l.orderId} className="border-b border-line last:border-b-0">
                  <Td className="font-bold">{l.orderNumber}</Td>
                  <Td>{l.customer}</Td>
                  <Td className="text-xs-plus">
                    {l.courierName} {l.trackingNo}
                  </Td>
                  <Td>{l.registeredAtText}</Td>
                  <Td right className="text-danger">
                    {l.elapsedText}
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

function CouriersPanel() {
  const stats = useAsync("couriers", () => legacyGet("/api/admin/shipments/couriers/stats"));
  if (stats.status === "loading" || stats.status === "idle") return <TableSkeleton rows={3} />;
  if (stats.status === "error") return <Notice notice={{ kind: "error", text: errorText(stats.error) }} />;
  const s = stats.data;
  return (
    <Panel title={"택배사별 (" + s.from + " ~ " + s.to + ")"}>
      <TableBox>
        <thead>
          <tr className="border-b border-line">
            <Th>택배사</Th>
            <Th right>송장</Th>
            <Th right>도착</Th>
            <Th right>평균 배송 시간</Th>
          </tr>
        </thead>
        <tbody>
          {s.couriers.map((c: any) => (
            <tr key={c.code} className="border-b border-line last:border-b-0">
              <Td>{c.name}</Td>
              <Td right>{comma(c.count)}</Td>
              <Td right>{comma(c.delivered)}</Td>
              <Td right>{c.averageText}</Td>
            </tr>
          ))}
        </tbody>
      </TableBox>
    </Panel>
  );
}
