// 관리자 배치: 실행 기록, 지금 실행, 자동 실행 멈춤·재개, 실행 로그, 최근 30일 상태
import { useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { Button } from "../../components/button.tsx";
import { Loaded } from "../../components/loaded.tsx";
import { EmptyState } from "../../components/states.tsx";
import { useAsync } from "../../lib/use-async.ts";
import { streamed } from "../../lib/streamed.ts";
import { errorText, legacyGet, legacyPost } from "../legacyApi.ts";
import { ConfirmDialog, Notice, PageTitle, Panel, TableBox, TableSkeleton, Tag, Td, Th, fieldClass, labelClass } from "../ui.tsx";

const PAGE_ROWS = 30;
const STATE_TEXT: any = { success: "성공", failed: "실패", skipped: "건너뜀", running: "실행 중" };
const STATE_TONE: any = { success: "green", failed: "red", skipped: "yellow", running: "blue" };

export function batchLoader({ request }: LoaderFunctionArgs) {
  const job = new URL(request.url).searchParams.get("job") || "";
  return { job: job, result: streamed(Promise.all([legacyGet("/api/admin/batch-runs", { job: job }), legacyGet("/api/admin/batch-health")])) };
}

export function BatchPage() {
  const { job, result } = useLoaderData<typeof batchLoader>();
  return (
    <>
      <PageTitle title="배치" />
      <Loaded resolve={result} failure="배치 기록을 불러오지 못했어요" skeleton={<TableSkeleton rows={8} />}>
        {([history, health]: any) => <BatchView key={job} job={job} history={history} health={health} />}
      </Loaded>
    </>
  );
}

function BatchView({ job, history, health }: { job: string; history: any; health: any }) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [notice, setNotice] = useState<any>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [pausing, setPausing] = useState<any>(null);
  const [logRunId, setLogRunId] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE_ROWS);

  async function runNow(key: string, name: string) {
    setRunning(key);
    setNotice(null);
    try {
      const r = await legacyPost("/api/admin/batch-runs/" + key + "/run");
      if (r.state === "success") setNotice({ kind: "ok", text: name + " 실행했어요." + (r.processed != null ? " 처리 " + r.processed + "건" : "") });
      else setNotice({ kind: "error", text: name + " 실행이 " + (STATE_TEXT[r.state] || r.state) + "했어요. " + (r.note || "") });
      void revalidator.revalidate();
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    } finally {
      setRunning(null);
    }
  }

  async function resume(key: string) {
    try {
      await legacyPost("/api/admin/batch-jobs/" + key + "/resume");
      setNotice({ kind: "ok", text: "자동 실행을 다시 켰어요." });
      void revalidator.revalidate();
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Notice notice={notice} />
      <Panel title="작업">
        <TableBox>
          <thead>
            <tr className="border-b border-line">
              <Th>작업</Th>
              <Th>자동 실행</Th>
              <Th>최근</Th>
              <Th right>30일 성공/실패/건너뜀</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {health.jobs.map((j: any) => {
              const state = history.jobStates[j.job];
              return (
                <tr key={j.job} className="border-b border-line last:border-b-0">
                  <Td className="font-bold">{j.name}</Td>
                  <Td className="whitespace-nowrap">
                    {state && state.paused ? (
                      <span className="flex flex-col">
                        <Tag tone="yellow">멈춤</Tag>
                        <span className="text-xs text-ink-3">
                          {state.pausedAtText} {state.pausedBy}
                          {state.memo ? " · " + state.memo : ""}
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-2">{j.time ? "매일 " + j.time : "10분마다"}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    {j.lastState ? (
                      <span className="flex items-center gap-2">
                        <Tag tone={STATE_TONE[j.lastState] || "gray"}>{STATE_TEXT[j.lastState] || j.lastState}</Tag>
                        <span className="text-xs text-ink-3">{j.lastStartedAtText}</span>
                      </span>
                    ) : (
                      <span className="text-ink-3">-</span>
                    )}
                  </Td>
                  <Td right>
                    {j.success} / <span className={j.failed > 0 ? "font-bold text-danger" : ""}>{j.failed}</span> / {j.skipped}
                  </Td>
                  <Td right>
                    <span className="flex justify-end gap-1">
                      <Button size="sm" disabled={running !== null} onClick={() => void runNow(j.job, j.name)}>
                        {running === j.job ? "실행 중" : "지금 실행"}
                      </Button>
                      {state && state.paused ? (
                        <Button variant="secondary" size="sm" onClick={() => void resume(j.job)}>
                          다시 켜기
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setPausing(j);
                          }}
                        >
                          멈추기
                        </Button>
                      )}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      </Panel>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <Panel
          title="실행 기록"
          aside={
            <select
              aria-label="작업 고르기"
              className={`${fieldClass} h-8 w-44 text-xs-plus`}
              value={job}
              onChange={(e) => {
                void navigate(e.target.value === "" ? "?" : "?job=" + e.target.value);
              }}
            >
              <option value="">모든 작업</option>
              {history.jobs.map((j: any) => (
                <option key={j.job} value={j.job}>
                  {j.name}
                </option>
              ))}
            </select>
          }
        >
          {history.runs.length === 0 ? (
            <EmptyState title="실행 기록이 없어요" />
          ) : (
            <TableBox>
              <thead>
                <tr className="border-b border-line">
                  <Th>시작</Th>
                  <Th>작업</Th>
                  <Th>대상</Th>
                  <Th>상태</Th>
                  <Th right>처리</Th>
                  <Th right>걸린 시간</Th>
                  <Th>메모</Th>
                </tr>
              </thead>
              <tbody>
                {history.runs.slice(0, shown).map((r: any) => (
                  <tr
                    key={r.id}
                    onClick={() => {
                      setLogRunId(r.id);
                    }}
                    className={`cursor-pointer border-b border-line last:border-b-0 ${logRunId === r.id ? "bg-accent-soft" : ""}`}
                  >
                    <Td className="whitespace-nowrap text-ink-2">{r.startedAtText}</Td>
                    <Td className="whitespace-nowrap">
                      {r.jobName}
                      {r.trigger === "manual" && <span className="ml-1 text-xs text-ink-3">(지금 실행)</span>}
                    </Td>
                    <Td className="whitespace-nowrap text-xs-plus text-ink-2">{r.runKey}</Td>
                    <Td>
                      <Tag tone={STATE_TONE[r.state] || "gray"}>{STATE_TEXT[r.state] || r.state}</Tag>
                    </Td>
                    <Td right>{r.processedText || "-"}</Td>
                    <Td right>{r.durationText || "-"}</Td>
                    <Td>
                      <span className={`block max-w-56 truncate text-xs-plus ${r.state === "failed" ? "text-danger" : "text-ink-2"}`}>{r.note || ""}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableBox>
          )}
          {history.runs.length > shown && (
            <div className="border-t border-line px-4 py-3 text-center md:px-6">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShown(shown + PAGE_ROWS);
                }}
              >
                더 보기 ({shown}/{history.runs.length})
              </Button>
            </div>
          )}
        </Panel>
        <RunLogPanel runId={logRunId} />
      </div>
      {pausing && (
        <PauseDialog
          job={pausing}
          onClose={() => {
            setPausing(null);
          }}
          onDone={() => {
            setPausing(null);
            setNotice({ kind: "ok", text: pausing.name + " 자동 실행을 멈췄어요. 지금 실행은 계속 쓸 수 있어요." });
            void revalidator.revalidate();
          }}
        />
      )}
    </div>
  );
}

function RunLogPanel({ runId }: { runId: number | null }) {
  const logs = useAsync(runId === null ? null : "logs:" + runId, () => legacyGet("/api/admin/batch-runs/" + runId + "/logs"));
  return (
    <div className="lg:sticky lg:top-4">
      <Panel title="실행 로그">
        {runId === null && <p className="px-4 py-5 text-sm text-ink-3 md:px-6">실행 기록을 누르면 로그가 보여요.</p>}
        {logs.status === "loading" && <p className="px-4 py-5 text-sm text-ink-3 md:px-6">불러오는 중이에요.</p>}
        {logs.status === "error" && <p className="px-4 py-5 text-sm text-danger md:px-6">{errorText(logs.error)}</p>}
        {logs.status === "ready" && (
          <div className="px-4 py-4 md:px-6">
            <p className="mb-2 text-sm font-bold text-ink">
              {logs.data.jobName} · {logs.data.startedAtText}
            </p>
            {logs.data.logs.length === 0 ? (
              <p className="text-xs-plus text-ink-3">남긴 로그가 없어요.</p>
            ) : (
              <ol className="flex flex-col gap-1 font-mono text-xs">
                {logs.data.logs.map((l: any) => (
                  <li key={l.id} className={l.level === "error" ? "text-danger" : "text-ink-2"}>
                    {l.atText} {l.message}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

function PauseDialog({ job, onClose, onDone }: { job: any; onClose: () => void; onDone: () => void }) {
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await legacyPost("/api/admin/batch-jobs/" + job.job + "/pause", { memo: memo });
      onDone();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <ConfirmDialog
      title={job.name + " 자동 실행을 멈출까요?"}
      body="다시 켤 때까지 정해진 시각에 돌지 않아요. 멈춘 동안 빠진 날은 다시 켠 뒤 지금 실행으로 채워요."
      confirmLabel="멈추기"
      busy={busy}
      error={error}
      onClose={onClose}
      onConfirm={() => void confirm()}
    >
      <label className="mt-4 flex flex-col gap-1">
        <span className={labelClass}>이유 (선택)</span>
        <input
          className={fieldClass}
          placeholder="DB 점검"
          value={memo}
          onChange={(e) => {
            setMemo(e.target.value);
          }}
        />
      </label>
    </ConfirmDialog>
  );
}
