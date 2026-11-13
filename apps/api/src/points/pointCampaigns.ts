// 포인트 지급 행사(관리자가 여러 고객에게 한 번에), 소멸 예정 안내, 원장 CSV
import {
  addDays,
  badRequest,
  customerLabel,
  emit,
  fmtDot,
  fmtMdHm,
  isBlank,
  isEmail,
  isValidDate,
  log,
  nowIso,
  now,
  pointText,
  splitList,
  startOfDay,
  toCsv,
  toDate,
  toInt,
  trim,
  tx,
  uniq,
  ymd,
  ym,
  POINT_KIND_TEXT,
} from "../legacy/legacyUtils.ts";
import * as campaignDao from "./infra/campaignDao.ts";
import { earn, getBalance } from "./pointManager.ts";

const MAX_CAMPAIGN_POINTS = 50000;

function campaignDto(c: any): any {
  return {
    id: c.id,
    title: c.title,
    points: c.points,
    pointsText: pointText(c.points),
    target: c.target,
    targetText: c.target === "all" ? "전체 고객" : "지정 고객",
    memberCount: c.member_count,
    totalPoints: c.total_points,
    skipped: c.skipped ? String(c.skipped).split(",") : [],
    createdBy: c.created_by_name || null,
    createdAt: c.created_at,
    createdAtText: fmtMdHm(c.created_at),
  };
}

export function campaigns(): any {
  const rows = campaignDao.listCampaigns(50);
  return { campaigns: rows.map(campaignDto), maxPoints: MAX_CAMPAIGN_POINTS };
}

/** 지급 대상 고르기: 전체 또는 이메일 목록. 없는 이메일은 건너뛰고 알려 준다 */
export function resolveTargets(target: string, emailsText: any): any {
  if (target === "all") return { members: campaignDao.allCustomers(), skipped: [] };
  const emails = uniq(splitList(emailsText).map((e) => e.toLowerCase()));
  if (emails.length === 0) throw badRequest("지급할 고객 이메일을 넣어 주세요.", { fieldErrors: { emails: ["한 줄에 하나씩 넣어 주세요"] } });
  const bad = emails.filter((e) => !isEmail(e));
  const members = campaignDao.customersByEmail(emails.filter((e) => isEmail(e)));
  const found: any = {};
  for (const m of members) found[String(m.email).toLowerCase()] = true;
  const missing = emails.filter((e) => isEmail(e) && !found[e]);
  return { members: members, skipped: bad.concat(missing) };
}

/** 미리 보기: 몇 명에게 얼마가 나가는지 */
export function preview(body: any): any {
  const points = toInt(body.points);
  const target = body.target === "all" ? "all" : "list";
  const t = resolveTargets(target, body.emails);
  return {
    memberCount: t.members.length,
    totalPoints: t.members.length * points,
    skipped: t.skipped,
    sample: t.members.slice(0, 5).map((m: any) => customerLabel(m)),
  };
}

/** 지급하기: 고객마다 적립(1년 뒤 소멸)하고 알림을 넣는다 */
export function grant(admin: any, body: any): any {
  const title = trim(body.title);
  const points = toInt(body.points);
  const target = body.target === "all" ? "all" : "list";
  const fieldErrors: any = {};
  if (title.length < 2) fieldErrors.title = ["행사 이름을 적어 주세요"];
  if (points <= 0) fieldErrors.points = ["1P 이상 넣어 주세요"];
  if (points > MAX_CAMPAIGN_POINTS) fieldErrors.points = ["한 사람에게 " + pointText(MAX_CAMPAIGN_POINTS) + "까지 줄 수 있어요"];
  if (Object.keys(fieldErrors).length > 0) throw badRequest("입력을 확인해 주세요.", { fieldErrors: fieldErrors });
  const t = resolveTargets(target, body.emails);
  if (t.members.length === 0) throw badRequest("지급할 고객이 없어요.", { fieldErrors: { emails: ["가입한 고객 이메일인지 확인해 주세요"] } });
  const at = nowIso();
  const id = tx(() => {
    const campaignId = campaignDao.insertCampaign({
      title: title.slice(0, 60),
      points: points,
      target: target,
      member_count: 0,
      total_points: 0,
      skipped: null,
      created_by: admin.id,
      created_at: at,
    });
    for (const m of t.members) earn(m.id, points, null, title.slice(0, 60), at);
    campaignDao.finishCampaign(campaignId, t.members.length, t.members.length * points, t.skipped.length > 0 ? t.skipped.join(",") : null);
    return campaignId;
  });
  for (const m of t.members) emit("points.granted", { userId: m.id, points: points, title: title, at: at });
  log("point_campaign_granted", { campaignId: id, members: t.members.length, points: points });
  const row = campaignDao.listCampaigns(50).find((c: any) => c.id === id);
  return campaignDto(row);
}

/**
 * 소멸 예정: 앞으로 사라질 적립분을 달별로 묶는다.
 * 이미 쓴 포인트가 있으면 보유분보다 많이 사라지지 않으므로 보유분을 넘는 몫은 뺀다.
 */
export function expiringSchedule(userId: any): any {
  const balance = getBalance(userId);
  const rows = campaignDao.upcomingExpiries(userId, nowIso());
  let left = balance;
  const months: any = {};
  const order: string[] = [];
  for (const r of rows) {
    if (left <= 0) break;
    const amount = Math.min(toInt(r.amount), left);
    left -= amount;
    const key = ym(r.expires_at);
    if (!months[key]) {
      months[key] = { month: key, points: 0, firstDate: r.expires_at };
      order.push(key);
    }
    months[key].points += amount;
  }
  const soonLimit = addDays(startOfDay(now()), 30).toISOString();
  let soon = 0;
  for (const k of order) if (months[k].firstDate <= soonLimit) soon += months[k].points;
  return {
    balance: balance,
    soonPoints: soon,
    soonText: soon > 0 ? "30일 안에 " + pointText(soon) + "가 사라져요" : null,
    months: order.map((k) => ({
      month: k,
      monthText: Number(k.slice(5, 7)) + "월",
      points: months[k].points,
      firstDateText: fmtDot(months[k].firstDate),
    })),
  };
}

/** 소멸 예정 알림 대상: 30일 안에 소멸할 포인트가 있는 고객 */
export function expiringNoticeTargets(days: number): any[] {
  const from = nowIso();
  const to = addDays(startOfDay(now()), days + 1).toISOString();
  return campaignDao.expiringByUser(from, to).map((r: any) => ({
    userId: r.user_id,
    points: Math.min(toInt(r.amount), toInt(r.balance)),
    firstAt: r.first_at,
  }));
}

/** 관리자: 기간 안 포인트 원장 CSV */
export function ledgerCsv(fromInput: any, toInput: any): any {
  const to = isBlank(toInput) ? ymd(now()) : String(toInput);
  const from = isBlank(fromInput) ? ymd(addDays(toDate(to), -29)) : String(fromInput);
  if (!isValidDate(from) || !isValidDate(to) || from > to) throw badRequest("기간을 확인해 주세요.");
  const rows = campaignDao.ledgerBetween(startOfDay(from).toISOString(), addDays(startOfDay(to), 1).toISOString());
  return {
    filename: "points-ledger-" + from + "_" + to + ".csv",
    csv: toCsv(rows, [
      { key: "created_at", title: "일시" },
      { key: "email", title: "고객" },
      { key: "kind", title: "종류", format: (v: any) => POINT_KIND_TEXT[v] || v },
      { key: "amount", title: "포인트" },
      { key: "balance_after", title: "잔액" },
      { key: "order_number", title: "주문 번호" },
      { key: "memo", title: "메모" },
      { key: "expires_at", title: "소멸 예정일", format: (v: any) => (v ? ymd(v) : "") },
    ]),
  };
}
