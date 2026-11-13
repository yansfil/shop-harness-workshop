// 고객 내 정보 화면들의 왼쪽 메뉴(모바일은 위쪽 가로 메뉴). 숫자는 /api/me/summary에서 온다.
import { NavLink, Outlet, useLocation } from "react-router";
import { useAsync } from "../lib/use-async.ts";
import { useRootData } from "../state/root-data.ts";
import { legacyGet } from "./legacyApi.ts";

const MENU = [
  { to: "/orders", label: "내 주문", key: "orders" },
  { to: "/shipments", label: "배송 조회", key: "shipments" },
  { to: "/points", label: "포인트", key: "points" },
  { to: "/coupons", label: "쿠폰", key: "coupons" },
  { to: "/returns", label: "반품·교환", key: "returns" },
  { to: "/notifications", label: "알림", key: "notifications" },
];

function badgeFor(key: string, s: any): string | null {
  if (!s) return null;
  if (key === "orders" && s.inProgressOrders > 0) return String(s.inProgressOrders);
  if (key === "points") return s.pointsText;
  if (key === "coupons" && s.usableCoupons > 0) return s.usableCoupons + "장";
  if (key === "returns" && s.openReturns > 0) return String(s.openReturns);
  if (key === "notifications" && s.unreadNotifications > 0) return String(s.unreadNotifications);
  return null;
}

export function AccountLayout() {
  const { user } = useRootData();
  const location = useLocation();
  const customer = user !== null && user.role === "customer";
  const summary = useAsync(customer ? "summary:" + location.key : null, () => legacyGet("/api/me/summary"));
  const s = summary.status === "ready" ? summary.data : null;
  return (
    <div className="md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-2 md:px-8 md:pt-6">
      {customer && (
        <nav aria-label="내 정보 메뉴" className="max-md:border-b max-md:border-line max-md:bg-ground">
          <ul className="flex gap-1 overflow-x-auto px-4 md:sticky md:top-6 md:flex-col md:gap-0 md:overflow-visible md:rounded-md md:border md:border-line md:bg-ground md:px-0 md:py-2">
            {MENU.map((m) => {
              const badge = badgeFor(m.key, s);
              return (
                <li key={m.to} className="shrink-0">
                  <NavLink
                    to={m.to}
                    end={m.to !== "/orders" && m.to !== "/returns"}
                    className={({ isActive }) =>
                      `flex h-11 items-center justify-between gap-2 px-3 text-sm md:px-4 ${isActive ? "font-extrabold text-ink md:bg-accent-soft" : "font-semibold text-ink-2"}`
                    }
                  >
                    {m.label}
                    {badge !== null && (
                      <span className={`rounded-pill px-1.5 text-xs leading-5 font-bold ${m.key === "notifications" || m.key === "returns" ? "bg-ink text-on-dark" : "text-ink-3"}`}>{badge}</span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <div className="min-w-0 md:[&>div]:px-0 md:[&>div]:pt-0">
        <Outlet />
      </div>
    </div>
  );
}
