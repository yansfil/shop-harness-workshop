// 고객 계정 요약: 내 정보 메뉴 옆 숫자(포인트·쓸 수 있는 쿠폰·안 읽은 알림·진행 중인 반품·배송중 주문)와 주문별 실제 결제 금액
import type { Router } from "express";
import { all, mustCustomer, nowIso, ok, one, pointText, wrap } from "./legacyUtils.ts";
import { getBalance } from "../points/pointManager.ts";
import { walletFor } from "../coupons/couponManager.ts";
import { unreadCount } from "../notifications/notificationQueue.ts";
import { expiringSchedule } from "../points/pointCampaigns.ts";

function openReturns(userId: number): number {
  const row = one("SELECT COUNT(*) AS n FROM return_requests WHERE user_id = ? AND state = 'requested'", userId);
  return row ? Number(row.n) : 0;
}

function ordersByStatus(userId: number): any {
  const out: any = { paid: 0, preparing: 0, shipping: 0, delivered: 0, cancelled: 0 };
  for (const r of all("SELECT status, COUNT(*) AS n FROM orders WHERE customer_id = ? GROUP BY status", userId)) out[r.status] = Number(r.n);
  return out;
}

export function summaryFor(user: any): any {
  const balance = getBalance(user.id);
  const wallet = walletFor(user.id);
  const expiring = expiringSchedule(user.id);
  const statuses = ordersByStatus(user.id);
  return {
    at: nowIso(),
    points: balance,
    pointsText: pointText(balance),
    pointsExpiringSoon: expiring.soonPoints,
    usableCoupons: wallet.usableCount,
    unreadNotifications: unreadCount(user.id),
    openReturns: openReturns(user.id),
    orders: statuses,
    inProgressOrders: statuses.paid + statuses.preparing + statuses.shipping,
  };
}

/** 내 주문마다 실제 결제 금액(쿠폰·포인트를 뺀 값). 예전 결제 기록이 없는 주문은 빠진다. */
export function paymentsFor(user: any): any {
  const rows = all(
    "SELECT p.order_id, p.paid_amount, p.coupon_discount, p.point_used, p.refunded_amount FROM order_payments p JOIN orders o ON o.id = p.order_id WHERE o.customer_id = ? ORDER BY p.order_id DESC",
    user.id,
  );
  return {
    payments: rows.map((r: any) => ({
      orderId: Number(r.order_id),
      paidAmount: Number(r.paid_amount),
      couponDiscount: Number(r.coupon_discount),
      pointUsed: Number(r.point_used),
      refundedAmount: Number(r.refunded_amount),
    })),
  };
}

export function registerAccountSummaryRoutes(router: Router): void {
  router.get(
    "/api/me/payments",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, paymentsFor(user));
    }),
  );
  router.get(
    "/api/me/summary",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, summaryFor(user));
    }),
  );
}
