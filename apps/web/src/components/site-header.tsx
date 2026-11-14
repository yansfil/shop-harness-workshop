import type { CurrentUser } from "@grabmarket/contracts";
import type { ReactNode } from "react";
import { Form, Link, NavLink, useLocation, useSearchParams } from "react-router";
import { loginPath } from "../lib/login-path.ts";
import { useCartLines } from "../state/cart.ts";
import { useRootData } from "../state/root-data.ts";
import { Icon } from "./icon.tsx";
import { SearchBox } from "./search-box.tsx";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`font-black tracking-tighter text-ink ${className}`}>
      그랩마켓
    </Link>
  );
}

/**
 * 고객 화면 머리: 맨 위 작은 메뉴 줄(데스크톱만), 로고·큰 검색창·내 주문·장바구니. 카테고리 줄(맨 끝이 기획전)은 데스크톱에서 항상, 모바일(375px)에서는 mobileCategories가 켜진
 * 화면(홈·카테고리·검색 결과)에만 둔다.
 */
export function SiteHeader({ mobileCategories }: { mobileCategories: boolean }) {
  const { user, categories } = useRootData();
  const location = useLocation();
  const [params] = useSearchParams();
  const cartCount = useCartLines().length;
  const eventsActive = location.pathname === "/events" || location.pathname.startsWith("/events/");
  const initialQuery = location.pathname === "/search" ? (params.get("q") ?? "") : "";
  const activeCategory = location.pathname.startsWith("/category/")
    ? location.pathname.slice("/category/".length)
    : location.pathname === "/search"
      ? params.get("category")
      : location.pathname === "/"
        ? "all"
        : null;

  return (
    <header className="relative z-40">
      <UtilityBar user={user} />
      <div className="border-b border-line bg-ground">
        <div className="mx-auto flex max-w-360 flex-wrap items-center px-4 md:h-20 md:flex-nowrap md:gap-8 md:px-8">
          <Logo className="order-1 flex h-14 items-center text-logo-m leading-7 md:h-auto md:w-33 md:text-logo md:leading-9" />
          <nav aria-label="내 메뉴" className="order-2 ml-auto flex h-14 items-center gap-4 md:order-3 md:h-auto md:gap-6">
            <Link to="/orders" className="flex flex-col items-center gap-0.5 text-2xs font-semibold text-ink-2 md:text-xs">
              <Icon name="receipt" className="size-5.5 text-ink md:size-6" />내 주문
            </Link>
            <Link to="/cart" className="relative flex flex-col items-center gap-0.5 text-2xs font-semibold text-ink-2 md:text-xs">
              <Icon name="cart" className="size-5.5 text-ink md:size-6" />
              장바구니
              {cartCount > 0 && (
                <b
                  aria-label={`${cartCount}개 담김`}
                  className="absolute -top-1 -right-1 min-w-4 rounded-pill bg-ink px-1 text-center text-2xs leading-4 font-bold text-on-dark md:min-w-4.5 md:text-xs md:leading-4.5"
                >
                  {cartCount}
                </b>
              )}
            </Link>
          </nav>
          <div className="order-3 w-full pb-3 md:order-2 md:flex md:w-auto md:flex-1 md:pb-0">
            <SearchBox key={location.key} initialQuery={initialQuery} />
          </div>
        </div>
      </div>
      <nav
        aria-label="카테고리"
        className={`border-b border-line bg-ground ${mobileCategories ? "" : "max-md:hidden"}`}
      >
        <ul className="mx-auto flex h-11 max-w-360 gap-5 overflow-x-auto px-4 md:h-12 md:gap-8 md:px-8">
          <CategoryLink to="/" active={activeCategory === "all"}>
            전체
          </CategoryLink>
          {categories.map((category) => (
            <CategoryLink key={category.slug} to={`/category/${category.slug}`} active={activeCategory === category.slug}>
              {category.name}
            </CategoryLink>
          ))}
          <li aria-hidden="true" className="flex items-center">
            <span className="h-4 w-px bg-line" />
          </li>
          <CategoryLink to="/events" active={eventsActive}>
            기획전
          </CategoryLink>
        </ul>
      </nav>
    </header>
  );
}

function CategoryLink({ to, active, children }: { to: string; active: boolean; children: string }) {
  return (
    <li className="flex">
      <NavLink
        to={to}
        end
        aria-current={active ? "page" : undefined}
        className={`relative flex items-center px-1 text-sm leading-5 whitespace-nowrap ${active ? "font-extrabold text-ink" : "font-semibold text-ink-2"}`}
      >
        {children}
        {active && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.75 bg-accent" />}
      </NavLink>
    </li>
  );
}

/** 항목 사이 얇은 세로선은 둘째 항목부터 왼쪽에 긋는다. */
const utilityItem =
  "relative px-2.5 text-xs leading-4 whitespace-nowrap last:pr-0 before:absolute before:top-0.75 before:left-0 before:h-2.5 before:w-px before:bg-line first:before:hidden";

function UtilityLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li className={utilityItem}>
      <NavLink to={to} className={({ isActive }) => (isActive ? "font-bold text-ink" : "text-ink-2")}>
        {children}
      </NavLink>
    </li>
  );
}

/**
 * 머리 맨 위 작은 메뉴 줄(데스크톱만, 375px에서는 숨김). 순서는 정해져 있다.
 * 로그인 전: 로그인, 주문배송, 장바구니, 고객센터 / 로그인 후: 이름님, (관리자는 관리자 화면,) 로그아웃, 주문배송, 장바구니, 고객센터
 */
function UtilityBar({ user }: { user: CurrentUser | null }) {
  const location = useLocation();
  return (
    <div className="border-b border-line bg-ground max-md:hidden">
      <nav aria-label="이용 안내" className="mx-auto flex h-8.5 max-w-360 justify-end px-8">
        <ul className="flex items-center">
          {user === null ? (
            <li className={utilityItem}>
              <Link to={loginPath(location.pathname + location.search)} className="text-ink-2">
                로그인
              </Link>
            </li>
          ) : (
            <>
              <li className={`${utilityItem} text-ink-2`}>
                <b className="font-bold text-ink">{user.name}</b>님
              </li>
              {user.role === "admin" && <UtilityLink to="/admin/orders">관리자 화면</UtilityLink>}
              <li className={utilityItem}>
                <Form method="post" action="/logout" className="flex">
                  <button type="submit" className="text-xs leading-4 text-ink-2">
                    로그아웃
                  </button>
                </Form>
              </li>
            </>
          )}
          <UtilityLink to="/orders">주문배송</UtilityLink>
          <UtilityLink to="/cart">장바구니</UtilityLink>
          <UtilityLink to="/help">고객센터</UtilityLink>
        </ul>
      </nav>
    </div>
  );
}
