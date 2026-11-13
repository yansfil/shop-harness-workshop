// 관리자 알림 대기열: 대기·실패·보냄, 다시 보내기, 보내지 않기, 지금 보내기, 종류별 현황, 문구 미리 보기, 공지 보내기
import { useState } from "react";
import { type LoaderFunctionArgs, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { Button } from "../../components/button.tsx";
import { Loaded } from "../../components/loaded.tsx";
import { EmptyState } from "../../components/states.tsx";
import { useAsync } from "../../lib/use-async.ts";
import { streamed } from "../../lib/streamed.ts";
import { errorText, fieldError, legacyGet, legacyPost } from "../legacyApi.ts";
import { FieldMessage, Notice, PageTitle, Panel, SegmentTabs, Stat, TableBox, TableSkeleton, Tag, Td, Th, fieldClass, labelClass } from "../ui.tsx";

const STATE_TEXT: any = { pending: "대기", failed: "실패", sent: "보냄", cancelled: "보내지 않음" };
const STATE_TONE: any = { pending: "yellow", failed: "red", sent: "green", cancelled: "muted" };

export function queueLoader({ request }: LoaderFunctionArgs) {
  const tab = new URL(request.url).searchParams.get("tab") === "sent" ? "sent" : "waiting";
  return { tab: tab, result: streamed(legacyGet("/api/admin/notification-queue", { tab: tab })) };
}

export function QueuePage() {
  const { tab, result } = useLoaderData<typeof queueLoader>();
  const navigate = useNavigate();
  const [panel, setPanel] = useState("queue");
  return (
    <>
      <PageTitle title="알림">
        <SegmentTabs
          value={panel}
          onChange={setPanel}
          options={[
            { value: "queue", label: "대기열" },
            { value: "stats", label: "종류별 현황" },
            { value: "templates", label: "문구" },
            { value: "announce", label: "공지 보내기" },
          ]}
        />
      </PageTitle>
      {panel === "queue" && (
        <Loaded resolve={result} failure="알림 대기열을 불러오지 못했어요" skeleton={<TableSkeleton rows={8} />}>
          {(data: any) => (
            <QueueView
              key={tab}
              data={data}
              onTab={(t) => {
                void navigate("?tab=" + t);
              }}
            />
          )}
        </Loaded>
      )}
      {panel === "stats" && <StatsPanel />}
      {panel === "templates" && <TemplatesPanel />}
      {panel === "announce" && <AnnouncePanel />}
    </>
  );
}

function QueueView({ data, onTab }: { data: any; onTab: (t: string) => void }) {
  const revalidator = useRevalidator();
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, path: string, okText: (r: any) => string) {
    setBusy(key);
    setNotice(null);
    try {
      const r = await legacyPost(path);
      setNotice({ kind: "ok", text: okText(r) });
      void revalidator.revalidate();
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="대기" value={data.counts.pending + "건"} />
        <Stat label="실패" value={data.counts.failed + "건"} sub={data.counts.failed > 0 ? "다시 보내기로 보낼 수 있어요" : undefined} />
        <Stat label="보냄" value={data.counts.sent + "건"} />
        <Stat label="보내는 일꾼" value={data.worker.running ? "도는 중" : "멈춤"} sub={"이번 실행에서 보냄 " + data.worker.sentCount + " · 실패 " + data.worker.failedCount} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentTabs
          value={data.tab}
          onChange={onTab}
          options={[
            { value: "waiting", label: "대기·실패", count: data.counts.waiting },
            { value: "sent", label: "보냄", count: data.counts.sent + data.counts.cancelled },
          ]}
        />
        <span className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={busy !== null || data.counts.failed === 0} onClick={() => void run("retryAll", "/api/admin/notification-queue/retry-failed", (r) => "실패 " + r.total + "건 중 " + r.sent + "건을 보냈어요.")}>
            실패 모두 다시 보내기
          </Button>
          <Button size="sm" disabled={busy !== null} onClick={() => void run("flush", "/api/admin/notification-queue/flush", (r) => "보낼 때가 된 " + r.picked + "건을 처리했어요. 보냄 " + r.sent + " · 실패 " + r.failed)}>
            지금 보내기
          </Button>
        </span>
      </div>
      <Notice notice={notice} />
      <Panel>
        {data.items.length === 0 ? (
          <EmptyState title={data.tab === "waiting" ? "기다리는 알림이 없어요" : "보낸 알림이 없어요"} />
        ) : (
          <TableBox>
            <thead>
              <tr className="border-b border-line">
                <Th>보낼 때</Th>
                <Th>종류</Th>
                <Th>받는 고객</Th>
                <Th>내용</Th>
                <Th right>시도</Th>
                <Th>상태</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((q: any) => (
                <tr key={q.id} className="border-b border-line last:border-b-0">
                  <Td className="whitespace-nowrap text-ink-2">{q.scheduledAtText}</Td>
                  <Td className="whitespace-nowrap">{q.typeText}</Td>
                  <Td className="whitespace-nowrap">{q.target}</Td>
                  <Td>
                    <span className="block max-w-64 truncate">{q.summary}</span>
                    {q.lastError && <span className="block text-xs text-danger">{q.lastError}</span>}
                  </Td>
                  <Td right>{q.attempts}</Td>
                  <Td>
                    <Tag tone={STATE_TONE[q.state] || "gray"}>{STATE_TEXT[q.state] || q.state}</Tag>
                  </Td>
                  <Td right>
                    <span className="flex justify-end gap-1">
                      {q.state === "failed" && (
                        <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void run("retry" + q.id, "/api/admin/notification-queue/" + q.id + "/retry", (r) => (r.state === "sent" ? "다시 보냈어요." : "또 보내지 못했어요."))}>
                          다시 보내기
                        </Button>
                      )}
                      {(q.state === "failed" || q.state === "pending") && (
                        <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void run("cancel" + q.id, "/api/admin/notification-queue/items/" + q.id + "/cancel", () => "보내지 않기로 했어요.")}>
                          보내지 않기
                        </Button>
                      )}
                    </span>
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

function StatsPanel() {
  const [days, setDays] = useState("7");
  const stats = useAsync("nstats:" + days, () => legacyGet("/api/admin/notification-stats", { days: days }));
  return (
    <Panel
      title="종류별 현황"
      aside={
        <SegmentTabs
          value={days}
          onChange={setDays}
          options={[
            { value: "7", label: "7일" },
            { value: "30", label: "30일" },
          ]}
        />
      }
    >
      {stats.status === "ready" ? (
        <TableBox>
          <thead>
            <tr className="border-b border-line">
              <Th>종류</Th>
              <Th right>전체</Th>
              <Th right>보냄</Th>
              <Th right>실패</Th>
              <Th right>대기</Th>
              <Th right>보내지 않음</Th>
              <Th right>실패 비율</Th>
            </tr>
          </thead>
          <tbody>
            {stats.data.types.map((t: any) => (
              <tr key={t.type} className={`border-b border-line last:border-b-0 ${t.total === 0 ? "text-ink-3" : ""}`}>
                <Td>{t.label}</Td>
                <Td right>{t.total}</Td>
                <Td right>{t.sent}</Td>
                <Td right className={t.failed > 0 ? "font-bold text-danger" : ""}>
                  {t.failed}
                </Td>
                <Td right>{t.pending}</Td>
                <Td right>{t.cancelled}</Td>
                <Td right>{t.failRateText}</Td>
              </tr>
            ))}
          </tbody>
        </TableBox>
      ) : (
        <p className="px-4 py-5 text-sm text-ink-3 md:px-6">{stats.status === "error" ? errorText(stats.error) : "불러오는 중이에요."}</p>
      )}
    </Panel>
  );
}

function TemplatesPanel() {
  const templates = useAsync("templates", () => legacyGet("/api/admin/notification-templates"));
  if (templates.status !== "ready") return <TableSkeleton rows={4} />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {templates.data.templates.map((t: any) => (
        <div key={t.type} className="rounded-md border border-line bg-ground p-4">
          <p className="flex items-center justify-between">
            <Tag tone="accent">{t.label}</Tag>
            <span className="font-mono text-xs text-ink-3">{t.type}</span>
          </p>
          <p className="mt-3 text-sm font-extrabold text-ink">{t.title}</p>
          <p className="mt-1 text-xs-plus text-ink-2">{t.body}</p>
          <p className="mt-2 text-xs text-ink-3">{t.link ? "누르면 " + t.link : "누를 곳 없음"}</p>
        </div>
      ))}
    </div>
  );
}

function AnnouncePanel() {
  const [attempt, setAttempt] = useState(0);
  const list = useAsync("announce:" + attempt, () => legacyGet("/api/admin/announcements"));
  const [form, setForm] = useState({ title: "", body: "", link: "" });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<any>(null);
  const [notice, setNotice] = useState<any>(null);
  async function send() {
    setBusy(true);
    setError(null);
    try {
      const r = await legacyPost("/api/admin/announcements", form);
      setNotice({ kind: "ok", text: r.sentCount + "명의 대기열에 넣었어요. 몇 초 안에 알림함으로 가요." });
      setForm({ title: "", body: "", link: "" });
      setConfirming(false);
      setAttempt(attempt + 1);
    } catch (e) {
      setError(e);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }
  const receivers = list.status === "ready" ? list.data.receivers : null;
  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[26rem_minmax(0,1fr)] lg:items-start">
      <Panel title="공지 보내기">
        <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
          <label className="flex flex-col gap-1">
            <span className={labelClass}>제목 (40자까지)</span>
            <input
              className={fieldClass}
              maxLength={40}
              value={form.title}
              onChange={(e) => {
                setForm({ ...form, title: e.target.value });
              }}
            />
            <FieldMessage text={fieldError(error, "title")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>내용 (200자까지)</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-ink-3 bg-ground p-3 text-sm text-ink"
              maxLength={200}
              value={form.body}
              onChange={(e) => {
                setForm({ ...form, body: e.target.value });
              }}
            />
            <FieldMessage text={fieldError(error, "body")} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClass}>누르면 갈 곳 (선택)</span>
            <input
              className={fieldClass}
              placeholder="/orders"
              value={form.link}
              onChange={(e) => {
                setForm({ ...form, link: e.target.value });
              }}
            />
            <FieldMessage text={fieldError(error, "link")} />
          </label>
          {error && !error.fieldErrors && <Notice notice={{ kind: "error", text: errorText(error) }} />}
          <Notice notice={notice} />
          {confirming ? (
            <div className="rounded-sm bg-accent-soft p-3">
              <p className="text-sm font-bold text-ink">{receivers === null ? "받기로 한 고객" : receivers + "명"}에게 보낼까요? 보낸 뒤에는 되돌릴 수 없어요.</p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  아니요
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void send()}>
                  {busy ? "보내는 중" : "보내기"}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              className="h-10"
              disabled={form.title.trim() === "" || form.body.trim() === ""}
              onClick={() => {
                setConfirming(true);
              }}
            >
              보내기
            </Button>
          )}
          <p className="text-xs text-ink-3">알림 설정에서 '그랩마켓 소식'을 끈 고객에게는 가지 않아요{receivers !== null ? " (받는 고객 " + receivers + "명)" : ""}.</p>
        </div>
      </Panel>
      <Panel title="보낸 공지">
        {list.status === "ready" && list.data.announcements.length === 0 && <p className="px-4 py-5 text-sm text-ink-3 md:px-6">아직 보낸 공지가 없어요.</p>}
        {list.status === "ready" && (
          <ul>
            {list.data.announcements.map((a: any) => (
              <li key={a.id} className="border-b border-line px-4 py-3 last:border-b-0 md:px-6">
                <p className="flex items-center justify-between gap-2">
                  <b className="text-sm font-bold text-ink">{a.title}</b>
                  <span className="text-xs text-ink-3">
                    {a.createdAtText} · {a.sentCount}명
                  </span>
                </p>
                <p className="mt-1 text-xs-plus text-ink-2">{a.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
