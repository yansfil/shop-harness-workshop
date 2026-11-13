// 알림함과 알림 받기 설정
import { useState } from "react";
import { Link, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { Button } from "../components/button.tsx";
import { Checkbox } from "../components/checkbox.tsx";
import { Loaded } from "../components/loaded.tsx";
import { Page } from "../components/page.tsx";
import { EmptyState } from "../components/states.tsx";
import { streamed } from "../lib/streamed.ts";
import { errorText, legacyGet, legacyPost, legacyPut } from "./legacyApi.ts";
import { Notice, PageTitle, Panel, SegmentTabs, TableSkeleton } from "./ui.tsx";

export function notificationsLoader() {
  return { result: streamed(Promise.all([legacyGet("/api/notifications"), legacyGet("/api/notification-settings")])) };
}

export function NotificationsPage() {
  const { result } = useLoaderData<typeof notificationsLoader>();
  return (
    <Page>
      <Loaded resolve={result} failure="알림을 불러오지 못했어요" skeleton={<TableSkeleton rows={5} />}>
        {([inbox, settings]: any) => <NotificationsView inbox={inbox} settings={settings} />}
      </Loaded>
    </Page>
  );
}

function NotificationsView({ inbox, settings }: { inbox: any; settings: any }) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const rows = filter === "unread" ? inbox.notifications.filter((n: any) => !n.read) : inbox.notifications;

  async function open(n: any) {
    if (!n.read) {
      try {
        await legacyPost("/api/notifications/" + n.id + "/read");
      } catch {
        // 읽음 표시를 못 해도 이동은 한다
      }
    }
    if (n.link) void navigate(n.link);
    else void revalidator.revalidate();
  }

  async function readAll() {
    setBusy(true);
    try {
      const r = await legacyPost("/api/notifications/read-all");
      setNotice({ kind: "ok", text: r.changed + "개를 읽음으로 바꿨어요." });
      void revalidator.revalidate();
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title="알림" count={inbox.unreadCount > 0 ? "안 읽은 알림 " + inbox.unreadCount + "개" : null}>
        <SegmentTabs
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "전체" },
            { value: "unread", label: "안 읽음", count: inbox.unreadCount },
          ]}
        />
        <Button variant="secondary" size="sm" className="h-9" disabled={busy || inbox.unreadCount === 0} onClick={() => void readAll()}>
          모두 읽음
        </Button>
      </PageTitle>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex flex-col gap-3">
          <Notice notice={notice} />
          <div className="rounded-md border border-line bg-ground">
            {rows.length === 0 ? (
              <EmptyState title={filter === "unread" ? "안 읽은 알림이 없어요" : "알림이 없어요"} hint="주문·배송·쿠폰 소식을 여기서 알려 드려요" />
            ) : (
              <ul>
                {rows.map((n: any) => (
                  <li key={n.id} className="border-b border-line last:border-b-0">
                    <button type="button" onClick={() => void open(n)} className={`flex w-full items-start gap-3 px-4 py-4 text-left md:px-6 ${n.read ? "" : "bg-accent-soft"}`}>
                      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-pill ${n.read ? "bg-transparent" : "bg-ink"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <b className={`text-sm text-ink ${n.read ? "font-semibold" : "font-extrabold"}`}>{n.title}</b>
                          <span className="shrink-0 text-xs text-ink-3">{n.createdAtText}</span>
                        </span>
                        <span className="mt-0.5 block text-xs-plus text-ink-2">{n.body}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <SettingsPanel initial={settings} />
      </div>
    </>
  );
}

function SettingsPanel({ initial }: { initial: any }) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<any>(null);
  async function toggle(key: string, value: boolean) {
    setSaving(key);
    setNotice(null);
    try {
      const saved = await legacyPut("/api/notification-settings", { [key]: value });
      setSettings(saved);
      setNotice({ kind: "ok", text: "저장했어요." });
    } catch (e) {
      setNotice({ kind: "error", text: errorText(e) });
    } finally {
      setSaving(null);
    }
  }
  const rows = [
    { key: "orderUpdates", label: "주문·배송·반품", hint: "끌 수 없어요", locked: true },
    { key: "coupons", label: "쿠폰 도착·만료", hint: null, locked: false },
    { key: "points", label: "포인트 적립·소멸", hint: null, locked: false },
    { key: "announcements", label: "그랩마켓 소식", hint: null, locked: false },
  ];
  return (
    <Panel title="알림 받기">
      <ul className="flex flex-col gap-3 px-4 py-4 md:px-6">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-3">
            <Checkbox
              visibleLabel
              label={r.label}
              checked={!!settings[r.key]}
              disabled={r.locked || saving !== null}
              onChange={(checked) => void toggle(r.key, checked)}
            />
            {r.hint && <span className="text-xs text-ink-3">{r.hint}</span>}
          </li>
        ))}
      </ul>
      <div className="px-4 pb-4 md:px-6">
        <Notice notice={notice} />
        <p className="mt-2 text-xs text-ink-3">
          끈 알림은 알림함에도 오지 않아요. <Link to="/points" className="underline">포인트 소멸 일정</Link>은 포인트 화면에서 볼 수 있어요.
        </p>
      </div>
    </Panel>
  );
}
