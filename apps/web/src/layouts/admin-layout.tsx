import { Form, Navigate, NavLink, Outlet, useLocation } from "react-router";
import { ForbiddenScreen } from "../components/forbidden-screen.tsx";
import { SiteHeader } from "../components/site-header.tsx";
import { loginPath } from "../lib/login-path.ts";
import { useRootData } from "../state/root-data.ts";

/** /admin 아래의 문지기. 로그인 전이면 로그인으로, 고객 계정이면 권한 없음(A5), 관리자만 관리자 화면을 본다. */
export function AdminGuard() {
  const { user } = useRootData();
  const location = useLocation();
  if (user === null) return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  if (user.role !== "admin") {
    return (
      <div className="min-h-dvh bg-canvas">
        <SiteHeader mobileCategories={false} />
        <main>
          <ForbiddenScreen />
        </main>
      </div>
    );
  }
  return <AdminLayout name={user.name} />;
}

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex h-full shrink-0 items-center px-1 text-base ${isActive ? "font-extrabold text-ink" : "font-semibold text-ink-2"}`;

function AdminLayout({ name }: { name: string }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-ground">
        <div className="mx-auto flex max-w-360 flex-wrap items-center gap-x-8 px-4 md:h-16 md:flex-nowrap md:px-8">
          <span className="flex h-14 shrink-0 items-center gap-2 md:h-auto">
            <span className="text-3xl leading-9 font-black tracking-tighter text-ink">그랩마켓</span>
            <span className="rounded-sm bg-ink px-2 py-0.5 text-xs font-bold text-on-dark">관리자</span>
          </span>
          <nav aria-label="관리자 메뉴" className="order-last flex h-11 w-full min-w-0 gap-5 overflow-x-auto md:order-none md:h-full md:w-auto">
            {[
              { to: "/admin/orders", label: "주문" },
              { to: "/admin/inventory", label: "재고" },
              { to: "/admin/settlements", label: "정산" },
              { to: "/admin/coupons", label: "쿠폰" },
              { to: "/admin/points", label: "포인트" },
              { to: "/admin/shipments", label: "배송" },
              { to: "/admin/returns", label: "반품" },
              { to: "/admin/notifications", label: "알림" },
              { to: "/admin/batch", label: "배치" },
            ].map((tab) => (
              <NavLink key={tab.to} to={tab.to} className={tabClass}>
                {({ isActive }) => (
                  <>
                    {tab.label}
                    {isActive && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.75 bg-accent" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-4 text-sm font-semibold text-ink-2">
            <span className="hidden md:inline">{name}</span>
            <Form method="post" action="/logout">
              <button type="submit" className="text-ink-2">
                로그아웃
              </button>
            </Form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-360 px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  );
}
