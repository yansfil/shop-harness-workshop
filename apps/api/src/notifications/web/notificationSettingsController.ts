// 알림 수신 설정·공지 API
import type { Router } from "express";
import { bodyOf, created, mustAdmin, mustCustomer, ok, wrap } from "../../legacy/legacyUtils.ts";
import * as notificationSettings from "../notificationSettings.ts";

export function registerNotificationSettingsRoutes(router: Router): void {
  router.get(
    "/api/notification-settings",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, notificationSettings.settingsOf(user.id));
    }),
  );

  router.put(
    "/api/notification-settings",
    wrap((req, res) => {
      const user = mustCustomer(res);
      ok(res, notificationSettings.saveSettingsFor(user.id, bodyOf(req)));
    }),
  );

  router.get(
    "/api/admin/announcements",
    wrap((_req, res) => {
      mustAdmin(res);
      ok(res, notificationSettings.announcements());
    }),
  );

  router.post(
    "/api/admin/announcements",
    wrap((req, res) => {
      const admin = mustAdmin(res);
      created(res, notificationSettings.sendAnnouncement(admin, bodyOf(req)));
    }),
  );
}
