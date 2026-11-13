// 알림 수신 설정·공지·정리 SQL
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";

export function findSettings(userId: any): any {
  return one("SELECT * FROM notification_settings WHERE user_id = ?", Number(userId));
}

export function saveSettings(userId: any, row: any, atIso: string): void {
  const exists = findSettings(userId);
  if (exists) {
    run(
      "UPDATE notification_settings SET coupons = ?, points = ?, announcements = ?, updated_at = ? WHERE user_id = ?",
      row.coupons ? 1 : 0,
      row.points ? 1 : 0,
      row.announcements ? 1 : 0,
      atIso,
      Number(userId),
    );
    return;
  }
  insert("notification_settings", {
    user_id: Number(userId),
    order_updates: 1,
    coupons: row.coupons ? 1 : 0,
    points: row.points ? 1 : 0,
    announcements: row.announcements ? 1 : 0,
    updated_at: atIso,
  });
}

/** 공지를 받는 고객 (설정에서 끄지 않은 고객) */
export function announcementReceivers(): any[] {
  return all(
    "SELECT u.id FROM users u LEFT JOIN notification_settings s ON s.user_id = u.id WHERE u.role = 'customer' AND COALESCE(s.announcements, 1) = 1 ORDER BY u.id",
  );
}

export function insertAnnouncement(row: any): number {
  return insert("announcements", row);
}

export function setAnnouncementSent(id: number, n: number): void {
  run("UPDATE announcements SET sent_count = ? WHERE id = ?", n, id);
}

export function listAnnouncements(limit: number): any[] {
  return all(
    "SELECT a.*, u.name AS created_by_name FROM announcements a LEFT JOIN users u ON u.id = a.created_by ORDER BY a.created_at DESC, a.id DESC LIMIT ?",
    limit,
  );
}

export function deleteReadBefore(beforeIso: string): number {
  return Number(run("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ? AND id NOT IN (SELECT notification_id FROM notification_queue WHERE notification_id IS NOT NULL)", beforeIso).changes);
}

export function deleteSentQueueBefore(beforeIso: string): number {
  return Number(run("DELETE FROM notification_queue WHERE state = 'sent' AND sent_at < ?", beforeIso).changes);
}

export function countOld(beforeIso: string): number {
  const a = one("SELECT COUNT(*) AS n FROM notification_queue WHERE state = 'sent' AND sent_at < ?", beforeIso);
  return a ? Number(a.n) : 0;
}
