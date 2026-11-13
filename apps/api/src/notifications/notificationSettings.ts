// 알림 수신 설정과 관리자 공지
import {
  addDays,
  badRequest,
  fmtMdHm,
  isBlank,
  isLocalLink,
  log,
  now,
  nowIso,
  toBool,
  trim,
  tx,
} from "../legacy/legacyUtils.ts";
import * as settingsDao from "./infra/settingsDao.ts";
import { enqueue } from "./notificationQueue.ts";

const DEFAULTS: any = { orderUpdates: true, coupons: true, points: true, announcements: true };

export function settingsOf(userId: any): any {
  const row = settingsDao.findSettings(userId);
  if (!row) return { ...DEFAULTS, updatedAt: null };
  return {
    orderUpdates: true,
    coupons: !!row.coupons,
    points: !!row.points,
    announcements: !!row.announcements,
    updatedAt: row.updated_at,
    updatedAtText: fmtMdHm(row.updated_at),
  };
}

/** 주문 알림은 끌 수 없다. 나머지만 바꾼다 */
export function saveSettingsFor(userId: any, body: any): any {
  const current = settingsOf(userId);
  const next = {
    coupons: body.coupons == null ? current.coupons : toBool(body.coupons),
    points: body.points == null ? current.points : toBool(body.points),
    announcements: body.announcements == null ? current.announcements : toBool(body.announcements),
  };
  settingsDao.saveSettings(userId, next, nowIso());
  log("notification_settings_saved", { userId: Number(userId) });
  return settingsOf(userId);
}

/* 공지 ------------------------------------------------------------------ */

export function announcements(): any {
  const rows = settingsDao.listAnnouncements(30);
  return {
    receivers: settingsDao.announcementReceivers().length,
    announcements: rows.map((a: any) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      link: a.link,
      sentCount: a.sent_count,
      createdBy: a.created_by_name || null,
      createdAtText: fmtMdHm(a.created_at),
    })),
  };
}

/** 공지 보내기: 받기로 한 고객 모두의 대기열에 넣는다 */
export function sendAnnouncement(admin: any, body: any): any {
  const title = trim(body.title);
  const text = trim(body.body);
  const link = trim(body.link);
  const fieldErrors: any = {};
  if (title.length < 2 || title.length > 40) fieldErrors.title = ["제목은 2~40자로 적어 주세요"];
  if (text.length < 2 || text.length > 200) fieldErrors.body = ["내용은 2~200자로 적어 주세요"];
  if (!isBlank(link) && !isLocalLink(link)) fieldErrors.link = ["/로 시작하는 그랩마켓 주소만 넣을 수 있어요"];
  if (Object.keys(fieldErrors).length > 0) throw badRequest("입력을 확인해 주세요.", { fieldErrors: fieldErrors });
  const at = nowIso();
  const receivers = settingsDao.announcementReceivers();
  const id = tx(() => {
    const announcementId = settingsDao.insertAnnouncement({
      title: title,
      body: text,
      link: isBlank(link) ? null : link,
      sent_count: 0,
      created_by: admin.id,
      created_at: at,
    });
    for (const r of receivers) enqueue(r.id, "announcement", { title: title, body: text, link: isBlank(link) ? null : link, announcementId: announcementId }, at);
    settingsDao.setAnnouncementSent(announcementId, receivers.length);
    return announcementId;
  });
  log("announcement_sent", { announcementId: id, receivers: receivers.length });
  return { id: id, sentCount: receivers.length };
}

/** 정리 배치: 90일 지난 읽은 알림과 30일 지난 보낸 대기열 기록을 지운다 */
export function cleanup(): any {
  const queueBefore = addDays(now(), -30).toISOString();
  const readBefore = addDays(now(), -90).toISOString();
  const total = settingsDao.countOld(queueBefore);
  const queue = settingsDao.deleteSentQueueBefore(queueBefore);
  const read = settingsDao.deleteReadBefore(readBefore);
  return { total: total, queue: queue, read: read };
}
