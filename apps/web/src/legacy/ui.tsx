// 예전 운영 화면이 같이 쓰는 작은 조각들 (토큰·컴포넌트는 앱과 같다)
import { type ReactNode, useState } from "react";
import { Link, NavLink } from "react-router";
import { Button } from "../components/button.tsx";
import { Bone } from "../components/states.tsx";
import { krw } from "../lib/format.ts";

export const fieldClass = "h-10 w-full rounded-md border border-ink-3 bg-ground px-3 text-sm text-ink disabled:bg-canvas disabled:text-ink-3";
export const labelClass = "text-xs-plus font-bold text-ink";

export function PageTitle({ title, count, children }: { title: string; count?: string | number | null; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-baseline gap-2 text-xl leading-8 font-extrabold text-ink">
        {title}
        {count !== undefined && count !== null && <span className="text-sm leading-5 font-semibold text-ink-2">{count}</span>}
      </h1>
      {children !== undefined && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** 테두리 있는 묶음. 제목 줄이 있으면 위에 붙인다 */
export function Panel({ title, aside, children, className = "" }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-line bg-ground ${className}`}>
      {title !== undefined && (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 md:px-6">
          <h2 className="text-base font-extrabold text-ink">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** 위쪽 탭(주소가 바뀌는 탭) */
export function RouteTabs({ tabs }: { tabs: { to: string; label: string; count?: number | null; end?: boolean }[] }) {
  return (
    <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end !== false}
          className={({ isActive }) =>
            `relative flex h-10 shrink-0 items-center gap-1 px-3 text-sm ${isActive ? "font-extrabold text-ink" : "font-semibold text-ink-2"}`
          }
        >
          {({ isActive }) => (
            <>
              {t.label}
              {t.count !== undefined && t.count !== null && <span className="text-xs text-ink-3">{t.count}</span>}
              {isActive && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.75 bg-accent" />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** 화면 안에서만 바뀌는 탭 */
export function SegmentTabs({ value, options, onChange }: { value: string; options: { value: string; label: string; count?: number | null }[]; onChange: (v: string) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-md border border-line bg-ground p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => {
            onChange(o.value);
          }}
          className={`flex h-8 items-center gap-1 rounded-sm px-3 text-xs-plus ${value === o.value ? "bg-ink font-bold text-on-dark" : "font-semibold text-ink-2"}`}
        >
          {o.label}
          {o.count !== undefined && o.count !== null && <span className={value === o.value ? "text-on-dark" : "text-ink-3"}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

const TONES: any = {
  gray: "bg-status-paid-bg text-status-paid-text",
  yellow: "bg-status-preparing-bg text-status-preparing-text",
  blue: "bg-status-shipping-bg text-status-shipping-text",
  green: "bg-status-delivered-bg text-status-delivered-text",
  red: "bg-danger-soft text-danger",
  muted: "bg-soldout-bg text-soldout-text",
  accent: "bg-accent-soft text-ink",
};

/** 상태 뱃지. tone: gray·yellow·blue·green·red·muted·accent */
export function Tag({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex h-5 items-center rounded-sm px-2 text-xs font-bold whitespace-nowrap ${TONES[tone] || TONES.gray}`}>{children}</span>;
}

/** 저장·실패 한 줄 알림 */
export function Notice({ notice }: { notice: { kind: "ok" | "error"; text: string } | null }) {
  if (!notice) return null;
  return (
    <p
      role={notice.kind === "error" ? "alert" : "status"}
      className={`rounded-sm px-3 py-2 text-xs-plus font-semibold ${notice.kind === "error" ? "bg-danger-soft text-danger" : "bg-status-delivered-bg text-status-delivered-text"}`}
    >
      {notice.text}
    </p>
  );
}

export function FieldMessage({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="mt-1 text-xs-plus font-semibold text-danger">{text}</p>;
}

/** 표 머리 칸 */
export function Th({ children, right = false, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return (
    <th scope="col" className={`h-10 px-3 text-xs-plus font-normal whitespace-nowrap text-ink-3 first:pl-4 last:pr-4 md:first:pl-6 md:last:pr-6 ${right ? "text-right" : "text-left"} ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, right = false, className = "" }: { children?: ReactNode; right?: boolean; className?: string }) {
  return <td className={`h-12 px-3 text-sm text-ink first:pl-4 last:pr-4 md:first:pl-6 md:last:pr-6 ${right ? "text-right whitespace-nowrap tabular-nums" : ""} ${className}`}>{children}</td>;
}

/** 가로로 넘치면 표 안에서만 밀리게 */
export function TableBox({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function Money({ value, strong = false }: { value: number | null | undefined; strong?: boolean }) {
  if (value === null || value === undefined) return <span className="text-ink-3">-</span>;
  return <span className={strong ? "font-extrabold" : ""}>{krw(value)}</span>;
}

/** 표 불러오는 중 막대 */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 rounded-md border border-line bg-ground p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <Bone key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** 숫자 칸 요약 (지표 한 줄) */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-line bg-ground px-4 py-3">
      <p className="text-xs-plus text-ink-3">{label}</p>
      <p className="mt-1 truncate text-lg font-extrabold text-ink">{value}</p>
      {sub !== undefined && <p className="mt-0.5 text-xs text-ink-2">{sub}</p>}
    </div>
  );
}

/** 되돌릴 수 없는 일을 하기 전에 묻는 창 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim p-0 md:items-center md:p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-110 rounded-t-md bg-ground p-6 md:rounded-md">
        <h2 id="confirm-title" className="text-lg font-extrabold text-ink">
          {title}
        </h2>
        {body !== undefined && <div className="mt-2 text-sm text-ink-2">{body}</div>}
        {children}
        {error ? (
          <p role="alert" className="mt-3 rounded-sm bg-danger-soft px-3 py-2 text-xs-plus font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <div className="mt-6 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={busy}>
            닫기
          </Button>
          <Button className="flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? "처리하는 중" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 기간 고르기 (from~to) */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  const [a, setA] = useState(from);
  const [b, setB] = useState(to);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onChange(a, b);
      }}
    >
      <label className="flex flex-col gap-1">
        <span className={labelClass}>시작일</span>
        <input type="date" className={`${fieldClass} w-40`} value={a} onChange={(e) => { setA(e.target.value); }} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>종료일</span>
        <input type="date" className={`${fieldClass} w-40`} value={b} onChange={(e) => { setB(e.target.value); }} />
      </label>
      <Button type="submit" variant="secondary" size="sm" className="h-10">
        조회
      </Button>
    </form>
  );
}

/** CSV 받기 링크 (버튼 모양) */
export function CsvLink({ href, label = "CSV 받기" }: { href: string; label?: string }) {
  return (
    <a href={href} download className="inline-flex h-8 items-center rounded-md border-2 border-ink bg-ground px-3 text-xs-plus font-bold text-ink">
      {label}
    </a>
  );
}

export function TextLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-xs-plus font-bold text-ink underline underline-offset-2">
      {children}
    </Link>
  );
}

/** 오늘 날짜 문자열 (YYYY-MM-DD, 한국 시각) */
export function todayKst(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts;
}
