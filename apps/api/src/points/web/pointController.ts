// 포인트 API
import type { Router } from "express";
import { mustAdmin, mustCustomer, ok, wrap, bodyOf, paramInt, toInt, customerLabel, loadUser, pointText } from "../../legacy/legacyUtils.ts";
import * as pointManager from "../pointManager.ts";
import { maxUsablePoints } from "../domain/pointPolicy.ts";
import { sumByKind, topHolders, totalOutstanding } from "../infra/pointDao.ts";

export function registerPointRoutes(router: Router): void {
  // 내 포인트 잔액과 내역
  router.get(
    "/api/points",
    wrap((_req, res) => {
      const user = mustCustomer(res);
      ok(res, pointManager.history(user.id));
    }),
  );

  // 주문서에서 쓸 수 있는 포인트
  router.get(
    "/api/points/usable",
    wrap((req, res) => {
      const user = mustCustomer(res);
      const payable = toInt(req.query.payable);
      const balance = pointManager.getBalance(user.id);
      ok(res, { balance: balance, max: maxUsablePoints(balance, payable), balanceText: pointText(balance) });
    }),
  );

  // 관리자: 포인트 현황
  router.get(
    "/api/admin/points/summary",
    wrap((_req, res) => {
      mustAdmin(res);
      const holders = topHolders(20).map((h: any) => ({
        id: h.user_id,
        user: customerLabel(h),
        name: h.name,
        balance: toInt(h.balance),
      }));
      ok(res, { outstanding: totalOutstanding(), holders: holders });
    }),
  );

  // 관리자: 고객 한 명의 포인트
  router.get(
    "/api/admin/points/:memberId",
    wrap((req, res) => {
      mustAdmin(res);
      const target = paramInt(req, "memberId");
      const user = loadUser(target);
      ok(res, { user: user ? { id: user.id, name: user.name, label: customerLabel(user) } : null, kinds: sumByKind(target), ...pointManager.history(target) });
    }),
  );

  // 관리자: 포인트 조정
  router.post(
    "/api/admin/points/:memberId/adjust",
    wrap((req, res) => {
      mustAdmin(res);
      const target = paramInt(req, "memberId");
      const body = bodyOf(req);
      ok(res, pointManager.adjust(target, body.amount, body.memo));
    }),
  );
}
