// 예전 운영 기능(정산·포인트·쿠폰·배송·반품·알림·배치)을 앱에 붙인다.
import type { Router } from "express";
import type { Controller } from "../shared/web/controller.ts";
import { clearTimers, initLegacy } from "./legacyUtils.ts";
import { registerPointRoutes } from "../points/web/pointController.ts";
import { registerCouponRoutes } from "../coupons/web/couponController.ts";
import { registerSettlementRoutes } from "../settlement/web/settlementController.ts";
import { registerDeliveryRoutes } from "../delivery/web/deliveryController.ts";
import { registerReturnRoutes } from "../returns/web/returnController.ts";
import { registerNotificationRoutes } from "../notifications/web/notificationController.ts";
import { registerBatchRoutes } from "../batch/web/batchController.ts";
import { registerCheckoutRoutes } from "../checkout/web/checkoutController.ts";
import { registerOrderExtrasRoutes } from "../checkout/web/orderExtrasController.ts";
import { listen } from "../notifications/notificationQueue.ts";
import { startNotificationWorker, stopNotificationWorker } from "../notifications/notificationWorker.ts";
import { startBatchScheduler, stopBatchScheduler } from "../batch/batchScheduler.ts";

export class LegacyRoutes implements Controller {
  register(router: Router): void {
    registerCheckoutRoutes(router);
    registerOrderExtrasRoutes(router);
    registerPointRoutes(router);
    registerCouponRoutes(router);
    registerSettlementRoutes(router);
    registerDeliveryRoutes(router);
    registerReturnRoutes(router);
    registerNotificationRoutes(router);
    registerBatchRoutes(router);
  }
}

/** 전역 DB·서비스를 넣고 알림 대기열이 다른 영역의 일을 듣게 한다 */
export function bootLegacy(db: any, services: any): void {
  initLegacy(db, services);
  listen();
}

/** 서버 프로세스에서만: 알림 작업자와 배치 스케줄러 */
export function startLegacyWorkers(): void {
  startNotificationWorker();
  startBatchScheduler();
}

export function stopLegacyWorkers(): void {
  stopNotificationWorker();
  stopBatchScheduler();
  clearTimers();
}
