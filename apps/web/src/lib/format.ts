import { formatWon, won } from "@grabmarket/shared";

/** 12900 → "12,900원" */
export function krw(value: number): string {
  return formatWon(won(value));
}

/** 12900 → "12,900" (큰 숫자와 작은 "원"을 따로 그릴 때) */
export function groupDigits(value: number): string {
  return won(value).toLocaleString("ko-KR");
}

const SEOUL = "Asia/Seoul";

function seoulParts(iso: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** "11-14 23:58" (목록용, 한국 시각) */
export function formatShortTime(iso: string): string {
  const p = seoulParts(iso);
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** "2026-11-14 19:40" (상세용, 한국 시각) */
export function formatFullTime(iso: string): string {
  const p = seoulParts(iso);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
