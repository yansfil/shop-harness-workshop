// 알림·알림 대기열 표
import { all, insert, one, run } from "../../legacy/legacyUtils.ts";

export function insertQueue(row: any): number {
  return insert("notification_queue", row);
}

export function findQueue(id: any): any {
  return one("SELECT * FROM notification_queue WHERE id = ?", Number(id));
}

export function dueQueue(atIso: string, limit: number): any[] {
  return all("SELECT * FROM notification_queue WHERE state = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at, id LIMIT ?", atIso, limit);
}

export function listQueue(states: string[], limit: number): any[] {
  const marks = states.map(() => "?").join(", ");
  return all(
    "SELECT q.*, u.name AS user_name, u.email AS user_email FROM notification_queue q JOIN users u ON u.id = q.user_id WHERE q.state IN (" +
      marks +
      ") ORDER BY CASE q.state WHEN 'failed' THEN 0 ELSE 1 END, q.scheduled_at DESC, q.id DESC LIMIT ?",
    ...states,
    limit,
  );
}

export function countQueue(): any {
  const rows = all("SELECT state, COUNT(*) AS n FROM notification_queue GROUP BY state");
  const out: any = { pending: 0, sent: 0, failed: 0 };
  for (const r of rows) out[r.state] = Number(r.n);
  return out;
}

export function markSent(id: any, notificationId: any, atIso: string): void {
  run("UPDATE notification_queue SET state = 'sent', attempts = attempts + 1, sent_at = ?, notification_id = ?, last_error = NULL WHERE id = ?", atIso, notificationId, Number(id));
}

export function markAttemptFailed(id: any, error: string, nextAtIso: string, finalFail: boolean): void {
  run(
    "UPDATE notification_queue SET attempts = attempts + 1, last_error = ?, scheduled_at = ?, state = ? WHERE id = ?",
    error,
    nextAtIso,
    finalFail ? "failed" : "pending",
    Number(id),
  );
}

export function resetForRetry(id: any, atIso: string): void {
  run("UPDATE notification_queue SET state = 'pending', attempts = 0, last_error = NULL, scheduled_at = ? WHERE id = ?", atIso, Number(id));
}

export function updatePayload(id: any, text: string): void {
  run("UPDATE notification_queue SET payload = ? WHERE id = ?", text, Number(id));
}

export function insertNotification(row: any): number {
  return insert("notifications", row);
}

export function listNotifications(userId: any, unreadOnly: boolean, limit: number): any[] {
  return all(
    "SELECT * FROM notifications WHERE user_id = ?" + (unreadOnly ? " AND read_at IS NULL" : "") + " ORDER BY created_at DESC, id DESC LIMIT ?",
    Number(userId),
    limit,
  );
}

export function unreadCount(userId: any): number {
  const row = one("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL", Number(userId));
  return row ? Number(row.n) : 0;
}

export function markRead(userId: any, id: any, atIso: string): number {
  return Number(run("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL", atIso, Number(id), Number(userId)).changes);
}

export function markAllRead(userId: any, atIso: string): number {
  return Number(run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", atIso, Number(userId)).changes);
}

export function userHasLogin(userId: any): boolean {
  const row = one("SELECT password_hash FROM users WHERE id = ?", Number(userId));
  return !!row && row.password_hash != null;
}
