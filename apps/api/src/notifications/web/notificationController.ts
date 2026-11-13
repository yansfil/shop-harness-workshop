// 알림 API
import type { Router } from "express";
import { mustAdmin, mustCustomer, ok, paramInt, queryStr, wrap } from "../../legacy/legacyUtils.ts";
import * as queue from "../notificationQueue.ts";
import { tick } from "../notificationWorker.ts";

export function registerNotificationRoutes(router: Router): void {
  // 내 알림함
  router.get(
    "/api/notifications",
    wrap((req, res) => {
      const user = mustCustomer(res);
      ok(res, queue.inbox(user.id, queryStr(req, "filter") === "unread"));
    }),
  );

  // 안 읽은 알림 수 (메뉴 뱃지)
  router.get(
    "/api/notifications/unread-count",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, { unreadCount: queue.unreadCount(user.id) });
    }),
  );

  router.post(
    "/api/notifications/read-all",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, queue.markAllRead(user.id));
    }),
  );

  router.post(
    "/api/notifications/:notificationId/read",
    wrap((req, res) => {
      const user = mustCustomer(res);
      ok(res, queue.markRead(user.id, paramInt(req, "notificationId")));
    }),
  );

  // 관리자: 알림 발송 대기열
  router.get(
    "/api/admin/notification-queue",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, queue.adminList(queryStr(req, "tab", "waiting")));
    }),
  );

  router.get(
    "/api/admin/notification-queue/counts",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, queue.queueCounts());
    }),
  );

  // 관리자: 다시 보내기
  router.post(
    "/api/admin/notification-queue/:queueId/retry",
    wrap((req, res) => {
      mustAdmin(res);
      ok(res, queue.retry(paramInt(req, "queueId")));
    }),
  );

  // 관리자: 지금 보내기
  router.post(
    "/api/admin/notification-queue/flush",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, tick() || { picked: 0, sent: 0, failed: 0 });
    }),
  );
}
