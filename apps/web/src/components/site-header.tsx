import { useEffect, useRef, useState } from "react";
import { Form, Link, NavLink, useLocation, useSearchParams } from "react-router";
import { useCartLines } from "../state/cart.ts";
import { useRootData } from "../state/root-data.ts";
import { Icon } from "./icon.tsx";
import { SearchBox } from "./search-box.tsx";
import { NotifyBell } from "../legacy/notify-bell.tsx";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`font-black tracking-tighter text-ink ${className}`}>
      그랩마켓
    </Link>
  );
}

/**
 * 고객 화면 머리: 로고·큰 검색창·내 주문·장바구니. 카테고리 줄은 데스크톱에서 항상, 모바일(375px)에서는 mobileCategories가 켜진
 * 화면(홈·카테고리·검색 결과)에만 둔다(D-46).
 */
export function SiteHeader({ mobileCategories }: { mobileCategories: boolean }) {
  const { user, categories } = useRootData();
  const location = useLocation();
  const [params] = useSearchParams();
  const cartCount = useCartLines().length;
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
      <div className="border-b border-line bg-ground">
        <div className="mx-auto flex max-w-360 flex-wrap items-center px-4 md:h-20 md:flex-nowrap md:gap-8 md:px-8">
          <Logo className="order-1 flex h-14 items-center text-logo-m leading-7 md:h-auto md:w-33 md:text-logo md:leading-9" />
          <nav aria-label="내 메뉴" className="order-2 ml-auto flex h-14 items-center gap-4 md:order-3 md:h-auto md:gap-6">
            {user !== null && <UserMenu key={location.key} name={user.name} admin={user.role === "admin"} />}
            {user !== null && user.role === "customer" && <NotifyBell />}
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

function UserMenu({ name, admin }: { name: string; admin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current !== null && event.target instanceof Node && !ref.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative max-md:hidden">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
        className={`flex h-10 items-center gap-1 rounded-md border bg-ground pr-2 pl-3 text-sm leading-5 font-semibold text-ink ${open ? "border-ink" : "border-line"}`}
      >
        {name}님
        <Icon name="expandMore" className="size-5" />
      </button>
      {open && (
        <div role="menu" className="absolute top-[calc(100%+8px)] right-0 w-42 overflow-hidden rounded-md border border-layer-edge bg-ground">
          <Link role="menuitem" to={admin ? "/admin/orders" : "/orders"} className="flex h-12 items-center px-4 text-sm font-semibold text-ink">
            {admin ? "관리자 화면" : "내 주문"}
          </Link>
          <Form method="post" action="/logout">
            <button role="menuitem" type="submit" className="flex h-12 w-full items-center border-t border-line px-4 text-sm font-semibold text-ink-2">
              로그아웃
            </button>
          </Form>
        </div>
      )}
    </div>
  );
}
