// 공통 유틸 모음 (예전 운영 시스템에서 가져온 파일)
// 정산·포인트·쿠폰·배송·반품·알림·배치가 모두 이 파일을 쓴다.
// 여기 함수를 바꾸면 쓰는 곳이 많으니 검색해 보고 고칠 것.

import type { Request, Response, NextFunction, RequestHandler } from "express";

/* ------------------------------------------------------------------ */
/* 전역 상태                                                            */
/* ------------------------------------------------------------------ */

let _db: any = null;
let _services: any = null;
let _booted = false;

export const STATE: any = {
  startedAt: null,
  lastBatchCheck: null,
  workerRunning: false,
  sentCount: 0,
  failedCount: 0,
  lastError: null,
  cache: {},
  timers: [],
};

export const CONFIG: any = {
  POINT_RATE: 0.01,
  POINT_EXPIRE_DAYS: 365,
  POINT_MIN_USE: 0,
  POINT_UNIT: 1,
  COUPON_PER_ORDER: 1,
  RETURN_DAYS: 7,
  RETURN_SHIPPING_FEE: 0,
  NOTIFY_INTERVAL_MS: 5000,
  NOTIFY_MAX_ATTEMPTS: 3,
  NOTIFY_BATCH_SIZE: 20,
  BATCH_CHECK_MS: 60000,
  DELIVERY_SYNC_MINUTES: 10,
  SETTLEMENT_CLOSE_TIME: "00:10",
  POINT_EXPIRE_TIME: "00:30",
  CSV_BOM: true,
  DEFAULT_DAILY_RANGE: 10,
  TIMEZONE_OFFSET_HOURS: 0,
  QUIET: false,
};

export function initLegacy(db: any, services: any): void {
  _db = db;
  _services = services;
  STATE.cache = {};
  if (!_booted) {
    STATE.startedAt = nowIso();
    _booted = true;
  }
}

export function getDb(): any {
  if (_db == null) throw new Error("legacy db not initialized");
  return _db;
}

export function getServices(): any {
  if (_services == null) throw new Error("legacy services not initialized");
  return _services;
}

export function hasDb(): boolean {
  return _db != null;
}

/** 서비스 쪽 트랜잭션에 같이 탄다. 안에서 다시 불러도 된다. */
export function tx(fn: () => any): any {
  const services = getServices();
  return services.uow.run(fn);
}

/* ------------------------------------------------------------------ */
/* 로그                                                                 */
/* ------------------------------------------------------------------ */

export function log(event: string, data?: any): void {
  if (CONFIG.QUIET) return;
  try {
    console.log(JSON.stringify({ at: nowIso(), event: event, ...(data || {}) }));
  } catch (e) {
    console.log(event);
  }
}

export function logError(event: string, error: any, data?: any): void {
  STATE.lastError = { event: event, message: error && error.message ? error.message : String(error), at: nowIso() };
  console.error(JSON.stringify({ at: nowIso(), event: event, error: error && error.stack ? error.stack : String(error), ...(data || {}) }));
}

/* ------------------------------------------------------------------ */
/* 날짜·시간                                                            */
/* ------------------------------------------------------------------ */

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function now(): Date {
  return new Date();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function nowMs(): number {
  return Date.now();
}

export function toDate(value: any): Date {
  if (value == null || value === "") return now();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + "T00:00:00.000Z");
  if (/^\d{8}$/.test(s)) return new Date(s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + "T00:00:00.000Z");
  return new Date(s);
}

export function iso(value: any): string {
  return toDate(value).toISOString();
}

export function isValidDate(value: any): boolean {
  if (value == null || value === "") return false;
  const d = toDate(value);
  return !isNaN(d.getTime());
}

/** 2026-11-14 */
export function ymd(value?: any): string {
  return toDate(value).toISOString().slice(0, 10);
}

/** 20261114 */
export function ymdCompact(value?: any): string {
  return ymd(value).replace(/-/g, "");
}

/** 2026-11 */
export function ym(value?: any): string {
  return toDate(value).toISOString().slice(0, 7);
}

export function today(): string {
  return ymd(now());
}

export function yesterday(): string {
  return ymd(addDays(now(), -1));
}

export function addMs(value: any, ms: number): Date {
  return new Date(toDate(value).getTime() + ms);
}

export function addMinutes(value: any, minutes: number): Date {
  return addMs(value, minutes * MINUTE);
}

export function addHours(value: any, hours: number): Date {
  return addMs(value, hours * HOUR);
}

export function addDays(value: any, days: number): Date {
  return addMs(value, days * DAY);
}

export function addMonths(value: any, months: number): Date {
  const d = toDate(value);
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

export function startOfDay(value: any): Date {
  return new Date(ymd(value) + "T00:00:00.000Z");
}

export function endOfDay(value: any): Date {
  return new Date(startOfDay(value).getTime() + DAY - 1);
}

export function startOfMonth(value: any): Date {
  return new Date(ym(value) + "-01T00:00:00.000Z");
}

export function startOfNextMonth(value: any): Date {
  return addMonths(startOfMonth(value), 1);
}

export function daysInMonth(value: any): number {
  return Math.round((startOfNextMonth(value).getTime() - startOfMonth(value).getTime()) / DAY);
}

export function diffMs(a: any, b: any): number {
  return toDate(a).getTime() - toDate(b).getTime();
}

export function diffDays(a: any, b: any): number {
  return diffMs(a, b) / DAY;
}

export function diffDaysFloor(a: any, b: any): number {
  return Math.floor(diffDays(a, b));
}

export function isPast(value: any): boolean {
  return toDate(value).getTime() < Date.now();
}

export function isFuture(value: any): boolean {
  return toDate(value).getTime() > nowMs();
}

export function isBetween(value: any, from: any, to: any): boolean {
  const t = toDate(value).getTime();
  return t >= toDate(from).getTime() && t <= toDate(to).getTime();
}

/** from~to 사이 날짜 목록 (양 끝 포함) */
export function dayList(from: any, to: any): string[] {
  const out: string[] = [];
  let d = startOfDay(from);
  const end = startOfDay(to).getTime();
  let guard = 0;
  while (d.getTime() <= end && guard < 1000) {
    out.push(ymd(d));
    d = addDays(d, 1);
    guard++;
  }
  return out;
}

/** from~to 사이 월 목록 (양 끝 포함) */
export function monthList(from: any, to: any): string[] {
  const out: string[] = [];
  let d = startOfMonth(from);
  const end = startOfMonth(to).getTime();
  let guard = 0;
  while (d.getTime() <= end && guard < 240) {
    out.push(ym(d));
    d = addMonths(d, 1);
    guard++;
  }
  return out;
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** 11-14 21:05 */
export function fmtMdHm(value: any): string {
  if (value == null || value === "") return "";
  const d = toDate(value);
  return pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) + " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
}

/** 11-14 */
export function fmtMd(value: any): string {
  if (value == null || value === "") return "";
  const d = toDate(value);
  return pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}

/** 2026.11.14 */
export function fmtDot(value: any): string {
  if (value == null || value === "") return "";
  return ymd(value).replace(/-/g, ".");
}

/** 2026-11-14 21:05:33 */
export function fmtFull(value: any): string {
  if (value == null || value === "") return "";
  return toDate(value).toISOString().replace("T", " ").slice(0, 19);
}

/** 11월 */
export function fmtMonthKo(monthKey: string): string {
  const m = Number(String(monthKey).slice(5, 7));
  return pad2(m) + "월";
}

export function fmtDurationMs(ms: any): string {
  if (ms == null || ms === "") return "";
  const n = Number(ms);
  if (isNaN(n)) return "";
  if (n < 1000) return (n / 1000).toFixed(1) + "초";
  if (n < 60000) return (n / 1000).toFixed(1) + "초";
  return Math.floor(n / 60000) + "분 " + Math.round((n % 60000) / 1000) + "초";
}

/** "내일 도착" 같은 짧은 말 */
export function relativeDayText(value: any): string {
  const days = Math.round(diffDays(startOfDay(value), startOfDay(now())));
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === 2) return "모레";
  if (days === -1) return "어제";
  if (days > 0) return days + "일 뒤";
  return -days + "일 전";
}

export function timeOfDay(value: any): string {
  const d = toDate(value);
  return pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes());
}

/** "00:10" 형식을 오늘 그 시각으로 */
export function todayAt(hhmm: string, base?: any): Date {
  const parts = String(hhmm).split(":");
  const h = Number(parts[0] || 0);
  const m = Number(parts[1] || 0);
  const d = startOfDay(base == null ? now() : base);
  return new Date(d.getTime() + h * HOUR + m * MINUTE);
}

/* ------------------------------------------------------------------ */
/* 돈·숫자                                                              */
/* ------------------------------------------------------------------ */

export function toNumber(value: any, fallback?: number): number {
  if (value == null || value === "") return fallback == null ? 0 : fallback;
  if (typeof value === "number") return value;
  const n = Number(String(value).replace(/[,원P\s]/g, ""));
  if (isNaN(n)) return fallback == null ? 0 : fallback;
  return n;
}

export function toInt(value: any, fallback?: number): number {
  const n = toNumber(value, fallback);
  return parseInt(String(n), 10);
}

export function toBool(value: any): boolean {
  if (value === true || value === 1) return true;
  const s = String(value).toLowerCase();
  return s === "true" || s === "1" || s === "y" || s === "yes" || s === "on";
}

/** "2,000원" → 2000 */
export function parseWon(value: any): number {
  return toNumber(value, 0);
}

export function roundWon(value: any): number {
  return Math.round(toNumber(value));
}

export function floorWon(value: any): number {
  return Math.floor(toNumber(value));
}

export function ceilWon(value: any): number {
  return Math.ceil(toNumber(value));
}

/** 금액 × 비율 */
export function percentOf(amount: any, rate: any): number {
  return toNumber(amount) * toNumber(rate);
}

/** 금액을 비중대로 나눈다. 합계가 원래 금액과 같도록 맞추지는 않는다. */
export function allocate(amount: any, weights: any[]): number[] {
  const total = weights.reduce((s: number, w: any) => s + toNumber(w), 0);
  if (total === 0) return weights.map(() => 0);
  return weights.map((w: any) => (toNumber(amount) * toNumber(w)) / total);
}

/** 12900 → "12,900" */
export function comma(value: any): string {
  const n = toNumber(value);
  const negative = n < 0;
  const parts = Math.abs(n).toFixed(0).split("");
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && (parts.length - i) % 3 === 0) out += ",";
    out += parts[i];
  }
  return (negative ? "-" : "") + out;
}

export function won(value: any): string {
  return comma(value) + "원";
}

export function signedWon(value: any): string {
  const n = toNumber(value);
  if (n > 0) return "+" + comma(n) + "원";
  if (n < 0) return "−" + comma(-n) + "원";
  return "0원";
}

export function pointText(value: any): string {
  return comma(value) + "P";
}

export function signedPoint(value: any): string {
  const n = toNumber(value);
  if (n > 0) return "+" + comma(n) + "P";
  if (n < 0) return "−" + comma(-n) + "P";
  return "0P";
}

export function sum(values: any[]): number {
  let s = 0;
  for (const v of values) s += toNumber(v);
  return s;
}

export function sumBy(rows: any[], key: string): number {
  let s = 0;
  for (const r of rows) s += toNumber(r ? r[key] : 0);
  return s;
}

export function avg(values: any[]): number {
  if (!values || values.length === 0) return 0;
  return sum(values) / values.length;
}

export function clamp(value: any, min: number, max: number): number {
  const n = toNumber(value);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function isPositiveInt(value: any): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

export function isNonNegativeInt(value: any): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

/* ------------------------------------------------------------------ */
/* 문자열                                                               */
/* ------------------------------------------------------------------ */

export function isBlank(value: any): boolean {
  return value == null || String(value).trim() === "";
}

export function str(value: any, fallback?: string): string {
  if (value == null) return fallback == null ? "" : fallback;
  return String(value);
}

export function trim(value: any): string {
  return str(value).trim();
}

export function upper(value: any): string {
  return trim(value).toUpperCase();
}

export function truncate(value: any, max: number): string {
  const s = str(value);
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

export function padLeft(value: any, length: number, ch?: string): string {
  let s = str(value);
  while (s.length < length) s = (ch || "0") + s;
  return s;
}

/** 김하늘 → 김*늘 */
export function maskName(value: any): string {
  const s = trim(value);
  if (s.length <= 1) return s;
  if (s.length === 2) return s[0] + "*";
  return s[0] + "*".repeat(s.length - 2) + s[s.length - 1];
}

/** 010-1234-5678 → 010-****-5678 */
export function maskPhone(value: any): string {
  const s = trim(value);
  const m = /^(\d{3})-?(\d{3,4})-?(\d{4})$/.exec(s);
  if (!m) return s;
  return m[1] + "-" + "*".repeat(String(m[2]).length) + "-" + m[3];
}

export function maskEmail(value: any): string {
  const s = trim(value);
  const at = s.indexOf("@");
  if (at <= 1) return s;
  return s[0] + "***" + s.slice(at);
}

/** "고객1" 같은 관리자 화면용 짧은 이름 */
export function customerLabel(user: any): string {
  if (!user) return "";
  if (user.email && /^customer(\d+)@/.test(user.email)) return "고객" + /^customer(\d+)@/.exec(user.email)![1];
  if (user.email && /^member(\d+)@/.test(user.email)) return "고객" + Number(/^member(\d+)@/.exec(user.email)![1]);
  return str(user.name);
}

export function isEmail(value: any): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trim(value));
}

export function isPhone(value: any): boolean {
  return /^01\d-?\d{3,4}-?\d{4}$/.test(trim(value));
}

export function onlyDigits(value: any): string {
  return str(value).replace(/\D/g, "");
}

export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  if (!word) return withBatchim;
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return withBatchim;
  return (code - 0xac00) % 28 > 0 ? withBatchim : withoutBatchim;
}

export function itemSummary(items: any[]): string {
  if (!items || items.length === 0) return "";
  const first = items[0].product_name || items[0].productName || "";
  if (items.length === 1) return first;
  return first + " 외 " + (items.length - 1) + "건";
}

/* ------------------------------------------------------------------ */
/* SQL                                                                  */
/* ------------------------------------------------------------------ */

/** 문자열을 SQL 따옴표로 감싼다 */
export function q(value: any): string {
  if (value == null) return "NULL";
  if (typeof value === "number") return String(value);
  return "'" + String(value) + "'";
}

export function sqlIn(values: any[]): string {
  if (!values || values.length === 0) return "(NULL)";
  return "(" + values.map((v) => (typeof v === "number" ? String(v) : q(v))).join(", ") + ")";
}

export function sqlNum(value: any): string {
  const n = Number(value);
  if (isNaN(n)) return "0";
  return String(n);
}

export function where(conditions: string[]): string {
  const list = conditions.filter((c) => !isBlank(c));
  if (list.length === 0) return "";
  return " WHERE " + list.join(" AND ");
}

export function all(sql: string, ...params: any[]): any[] {
  return getDb().prepare(sql).all(...params);
}

export function one(sql: string, ...params: any[]): any {
  return getDb().prepare(sql).get(...params);
}

export function run(sql: string, ...params: any[]): any {
  return getDb().prepare(sql).run(...params);
}

export function insert(table: string, row: any): number {
  const keys = Object.keys(row);
  const sql = "INSERT INTO " + table + " (" + keys.join(", ") + ") VALUES (" + keys.map(() => "?").join(", ") + ")";
  const result = getDb().prepare(sql).run(...keys.map((k) => normalizeParam(row[k])));
  return Number(result.lastInsertRowid);
}

export function update(table: string, id: any, row: any, idColumn?: string): number {
  const keys = Object.keys(row);
  if (keys.length === 0) return 0;
  const sql = "UPDATE " + table + " SET " + keys.map((k) => k + " = ?").join(", ") + " WHERE " + (idColumn || "id") + " = ?";
  const result = getDb().prepare(sql).run(...keys.map((k) => normalizeParam(row[k])), id);
  return Number(result.changes);
}

export function count(table: string, whereSql?: string): number {
  const row = one("SELECT COUNT(*) AS n FROM " + table + (whereSql ? " WHERE " + whereSql : ""));
  return row ? Number(row.n) : 0;
}

function normalizeParam(value: any): any {
  if (value === undefined) return null;
  if (value === true) return 1;
  if (value === false) return 0;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function tableExists(name: string): boolean {
  const row = one("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name);
  return !!row;
}

/* ------------------------------------------------------------------ */
/* 검사                                                                 */
/* ------------------------------------------------------------------ */

export class LegacyError extends Error {
  status: number;
  code: string;
  extra: any;
  constructor(status: number, code: string, message: string, extra?: any) {
    super(message);
    this.name = "LegacyError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function badRequest(message: string, extra?: any): LegacyError {
  return new LegacyError(400, "VALIDATION_FAILED", message, extra);
}

export function notFoundError(message?: string): LegacyError {
  return new LegacyError(404, "NOT_FOUND", message || "찾을 수 없습니다.");
}

export function conflict(code: string, message: string, extra?: any): LegacyError {
  return new LegacyError(409, code, message, extra);
}

export function forbidden(message?: string): LegacyError {
  return new LegacyError(403, "FORBIDDEN", message || "관리자만 이용할 수 있습니다.");
}

export function unauthenticated(): LegacyError {
  return new LegacyError(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
}

export function required(body: any, fields: string[]): void {
  const missing: any = {};
  for (const f of fields) {
    if (body == null || isBlank(body[f])) missing[f] = ["필수 값입니다"];
  }
  if (Object.keys(missing).length > 0) throw badRequest("요청 형식이 올바르지 않습니다.", { fieldErrors: missing });
}

export function mustPositiveInt(value: any, field: string): number {
  if (!isPositiveInt(value)) throw badRequest(field + " 값이 올바르지 않습니다.", { fieldErrors: { [field]: ["1 이상의 정수여야 합니다"] } });
  return Number(value);
}

export function mustNonNegativeInt(value: any, field: string): number {
  if (!isNonNegativeInt(value)) throw badRequest(field + " 값이 올바르지 않습니다.", { fieldErrors: { [field]: ["0 이상의 정수여야 합니다"] } });
  return Number(value);
}

export function mustOneOf(value: any, list: any[], field: string): any {
  if (list.indexOf(value) < 0) throw badRequest(field + " 값이 올바르지 않습니다.", { fieldErrors: { [field]: ["허용되지 않는 값입니다"] } });
  return value;
}

export function mustDate(value: any, field: string): Date {
  if (!isValidDate(value)) throw badRequest(field + " 날짜가 올바르지 않습니다.", { fieldErrors: { [field]: ["날짜 형식이 아닙니다"] } });
  return toDate(value);
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */

export function getLoginUser(res: Response): any {
  return res.locals.sessionUser || null;
}

export function mustLogin(res: Response): any {
  const user = getLoginUser(res);
  if (!user) throw unauthenticated();
  return user;
}

export function mustCustomer(res: Response): any {
  const user = mustLogin(res);
  if (user.role !== "customer") throw new LegacyError(403, "FORBIDDEN", "고객 계정으로만 이용할 수 있습니다.");
  return user;
}

export function mustAdmin(res: Response): any {
  const user = mustLogin(res);
  if (!isAdmin(user)) throw forbidden();
  return user;
}

export function isAdmin(user: any): boolean {
  return !!user && user.role === "admin";
}

export function ok(res: Response, data: any): void {
  res.status(200).json(data);
}

export function created(res: Response, data: any): void {
  res.status(201).json(data);
}

export function fail(res: Response, status: number, code: string, message: string, extra?: any): void {
  res.status(status).json({ error: { code: code, message: message, ...(extra || {}) } });
}

/** 핸들러를 감싸 LegacyError는 바로 응답하고 나머지는 공통 오류 처리기로 넘긴다 */
export function wrap(fn: (req: Request, res: Response) => any): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = fn(req, res);
      if (result && typeof result.then === "function") {
        result.catch((e: any) => {
          handleError(e, res, next);
        });
      }
    } catch (e: any) {
      handleError(e, res, next);
    }
  };
}

function handleError(e: any, res: Response, next: NextFunction): void {
  if (e instanceof LegacyError) {
    fail(res, e.status, e.code, e.message, e.extra);
    return;
  }
  next(e);
}

export function queryStr(req: Request, key: string, fallback?: string): string {
  const v: any = (req.query as any)[key];
  if (v == null) return fallback == null ? "" : fallback;
  if (Array.isArray(v)) return str(v[0]);
  return str(v);
}

export function paramInt(req: Request, key: string): number {
  const v: any = (req.params as any)[key];
  return mustPositiveInt(v, key);
}

export function bodyOf(req: Request): any {
  return req.body || {};
}

/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

export function csvEscape(value: any): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** columns: [{ key, title, format? }] */
export function toCsv(rows: any[], columns: any[]): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => csvEscape(c.title)).join(","));
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const raw = typeof c.value === "function" ? c.value(row) : row[c.key];
          return csvEscape(c.format ? c.format(raw, row) : raw);
        })
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=\"" + filename + "\"; filename*=UTF-8''" + encodeURIComponent(filename));
  res.status(200).send((CONFIG.CSV_BOM ? "﻿" : "") + csv);
}

/* ------------------------------------------------------------------ */
/* 이름표                                                               */
/* ------------------------------------------------------------------ */

export const ORDER_STATUS_TEXT: any = {
  paid: "결제완료",
  preparing: "배송준비",
  shipping: "배송중",
  delivered: "배송완료",
  cancelled: "취소됨",
};

export const COURIERS: any[] = [
  { code: "SB", name: "새벽택배(가상)", prefix: "SB" },
  { code: "HU", name: "한울택배(가상)", prefix: "HU" },
  { code: "DO", name: "다온택배(가상)", prefix: "DO" },
];

export function courierName(code: any): string {
  const c = COURIERS.find((x) => x.code === code);
  return c ? c.name : str(code);
}

export const RETURN_REASONS: any[] = [
  { code: "damaged", text: "상품이 손상됐어요" },
  { code: "wrong_item", text: "다른 상품이 왔어요" },
  { code: "size", text: "사이즈가 안 맞아요" },
  { code: "changed_mind", text: "단순 변심" },
  { code: "late", text: "배송이 너무 늦었어요" },
  { code: "broken_in_transit", text: "배송 중 파손" },
];

export function returnReasonText(code: any): string {
  const r = RETURN_REASONS.find((x) => x.code === code);
  return r ? r.text : str(code);
}

export const RETURN_KIND_TEXT: any = { return: "반품", exchange: "교환" };
export const RETURN_STATE_TEXT: any = { requested: "승인 대기", approved: "승인됨", rejected: "거절됨" };

export const POINT_KIND_TEXT: any = {
  earn: "적립",
  use: "사용",
  expire: "소멸",
  refund: "환불",
  admin: "조정",
};

export const NOTIFY_TYPES: any = {
  order_placed: { title: "주문이 접수됐어요", icon: "receipt", label: "주문 접수" },
  order_cancelled: { title: "주문이 취소됐어요", icon: "cancel", label: "주문 취소" },
  shipping_started: { title: "배송이 시작됐어요", icon: "truck", label: "배송 시작" },
  delivered: { title: "배송이 완료됐어요", icon: "check", label: "배송 완료" },
  coupon_arrived: { title: "쿠폰이 도착했어요", icon: "ticket", label: "쿠폰 도착" },
  return_received: { title: "반품 신청을 받았어요", icon: "return", label: "반품 접수" },
  exchange_received: { title: "교환 신청을 받았어요", icon: "return", label: "교환 접수" },
  return_approved: { title: "반품이 승인됐어요", icon: "return", label: "반품 승인" },
  exchange_approved: { title: "교환이 승인됐어요", icon: "return", label: "교환 승인" },
  return_rejected: { title: "반품이 거절됐어요", icon: "return", label: "반품 거절" },
  points_expiring: { title: "포인트가 곧 사라져요", icon: "point", label: "포인트 소멸 예정" },
};

export function notifyTypeLabel(type: any): string {
  return NOTIFY_TYPES[type] ? NOTIFY_TYPES[type].label : str(type);
}

export const BATCH_JOBS: any = {
  settlement_close: { name: "일 마감 정산", time: "00:10" },
  point_expire: { name: "포인트 소멸", time: "00:30" },
  delivery_sync: { name: "배송 상태 동기화", time: null },
};

export function batchJobName(job: any): string {
  return BATCH_JOBS[job] ? BATCH_JOBS[job].name : str(job);
}

/* ------------------------------------------------------------------ */
/* 모음                                                                 */
/* ------------------------------------------------------------------ */

export function groupBy(rows: any[], keyFn: any): any {
  const out: any = {};
  for (const r of rows) {
    const k = typeof keyFn === "function" ? keyFn(r) : r[keyFn];
    if (!out[k]) out[k] = [];
    out[k].push(r);
  }
  return out;
}

export function indexBy(rows: any[], key: string): any {
  const out: any = {};
  for (const r of rows) out[r[key]] = r;
  return out;
}

export function uniq(values: any[]): any[] {
  const out: any[] = [];
  for (const v of values) if (out.indexOf(v) < 0) out.push(v);
  return out;
}

export function sortBy(rows: any[], key: string, desc?: boolean): any[] {
  return rows.slice().sort((a: any, b: any) => {
    if (a[key] < b[key]) return desc ? 1 : -1;
    if (a[key] > b[key]) return desc ? -1 : 1;
    return 0;
  });
}

export function chunk(values: any[], size: number): any[][] {
  const out: any[][] = [];
  for (let i = 0; i < values.length; i += size) out.push(values.slice(i, i + size));
  return out;
}

export function pick(obj: any, keys: string[]): any {
  const out: any = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function omit(obj: any, keys: string[]): any {
  const out: any = {};
  for (const k of Object.keys(obj || {})) if (keys.indexOf(k) < 0) out[k] = obj[k];
  return out;
}

export function clone(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}

export function safeJson(text: any, fallback?: any): any {
  try {
    return JSON.parse(String(text));
  } catch (e) {
    return fallback == null ? {} : fallback;
  }
}

/* ------------------------------------------------------------------ */
/* 이벤트                                                               */
/* ------------------------------------------------------------------ */

const LISTENERS: any = {};

export function on(event: string, fn: (payload: any) => void): void {
  if (!LISTENERS[event]) LISTENERS[event] = [];
  if (LISTENERS[event].indexOf(fn) < 0) LISTENERS[event].push(fn);
}

export function off(event: string, fn?: (payload: any) => void): void {
  if (!LISTENERS[event]) return;
  if (!fn) {
    LISTENERS[event] = [];
    return;
  }
  LISTENERS[event] = LISTENERS[event].filter((x: any) => x !== fn);
}

export function emit(event: string, payload: any): void {
  const list = LISTENERS[event] || [];
  for (const fn of list) {
    try {
      fn(payload);
    } catch (e) {
      logError("legacy_event_failed", e, { legacyEvent: event });
    }
  }
}

export function listenerCount(event: string): number {
  return (LISTENERS[event] || []).length;
}

/* ------------------------------------------------------------------ */
/* 번호                                                                 */
/* ------------------------------------------------------------------ */

/** RT-0412 */
export function makeReturnNo(seq: number): string {
  return "RT-" + padLeft(seq, 4);
}

/** SB-5521-0087-4412 */
export function makeTrackingNo(courierCode: string, seq: number): string {
  const c = COURIERS.find((x) => x.code === courierCode);
  const prefix = c ? c.prefix : "XX";
  const n = padLeft(seq, 12);
  return prefix + "-" + n.slice(0, 4) + "-" + n.slice(4, 8) + "-" + n.slice(8, 12);
}

export function isTrackingNo(value: any): boolean {
  return /^[A-Z]{2}-\d{4}-\d{4}-\d{4}$/.test(trim(value));
}

export function nextSeq(table: string, column: string, prefix: string): number {
  const row = one("SELECT " + column + " AS v FROM " + table + " WHERE " + column + " LIKE ? ORDER BY id DESC LIMIT 1", prefix + "%");
  if (!row || !row.v) return 1;
  const digits = onlyDigits(row.v);
  return Number(digits) + 1;
}

/* ------------------------------------------------------------------ */
/* 주문 조회 (여러 화면 공통)                                            */
/* ------------------------------------------------------------------ */

export function loadOrderRow(orderId: any): any {
  return one(
    "SELECT o.*, u.name AS customer_name, u.email AS customer_email FROM orders o JOIN users u ON u.id = o.customer_id WHERE o.id = ?",
    Number(orderId),
  );
}

export function loadOrderByNumber(orderNumber: any): any {
  return one(
    "SELECT o.*, u.name AS customer_name, u.email AS customer_email FROM orders o JOIN users u ON u.id = o.customer_id WHERE o.order_number = ?",
    str(orderNumber),
  );
}

export function loadOrderItems(orderId: any): any[] {
  return all(
    "SELECT i.*, p.image_path FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = ? ORDER BY i.id",
    Number(orderId),
  );
}

export function loadPayment(orderId: any): any {
  const row = one("SELECT * FROM order_payments WHERE order_id = ?", Number(orderId));
  if (row) return row;
  const order = loadOrderRow(orderId);
  if (!order) return null;
  return {
    order_id: order.id,
    coupon_id: null,
    coupon_discount: 0,
    point_used: 0,
    paid_amount: order.total,
    reward_points: 0,
    refunded_amount: 0,
    refund_status: "none",
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

export function loadUser(userId: any): any {
  return one("SELECT id, email, name, role, phone, address, created_at FROM users WHERE id = ?", Number(userId));
}

export function orderItemsText(orderId: any): string {
  return itemSummary(loadOrderItems(orderId));
}

export function shortOrderNo(orderNumber: any): string {
  const s = str(orderNumber);
  const m = /^GM-\d{8}-(\d{4})$/.exec(s);
  return m ? "GM-" + m[1] : s;
}

export function toItemDto(item: any): any {
  return {
    orderItemId: item.id,
    productId: item.product_id,
    productName: item.product_name,
    imageUrl: item.image_path,
    unitPrice: item.unit_price,
    quantity: item.quantity,
    lineTotal: item.line_total,
  };
}

/* ------------------------------------------------------------------ */
/* 기타                                                                 */
/* ------------------------------------------------------------------ */

export function memo(key: string, ttlMs: number, fn: () => any): any {
  const hit = STATE.cache[key];
  if (hit && hit.expires > nowMs()) return hit.value;
  const value = fn();
  STATE.cache[key] = { value: value, expires: nowMs() + ttlMs };
  return value;
}

export function clearMemo(prefix?: string): void {
  if (!prefix) {
    STATE.cache = {};
    return;
  }
  for (const k of Object.keys(STATE.cache)) if (k.indexOf(prefix) === 0) delete STATE.cache[k];
}

export function retry(fn: () => any, times: number): any {
  let lastError: any = null;
  for (let i = 0; i < times; i++) {
    try {
      return fn();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export function addTimer(timer: any): void {
  STATE.timers.push(timer);
}

export function clearTimers(): void {
  for (const t of STATE.timers) clearInterval(t);
  STATE.timers = [];
}

/** 시드에서 쓰는 결정적 난수 (mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function randPick(rand: () => number, list: any[]): any {
  return list[Math.floor(rand() * list.length)];
}
