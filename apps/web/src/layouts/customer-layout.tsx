import { Outlet, useMatches } from "react-router";
import { SiteHeader } from "../components/site-header.tsx";

/** 라우트의 handle에 mobileCategories를 켜면 모바일 머리에도 카테고리 줄이 붙는다(홈·카테고리·검색 결과). */
export interface CustomerRouteHandle {
  mobileCategories?: boolean;
}

export function CustomerLayout() {
  const mobileCategories = useMatches().some((match) => (match.handle as CustomerRouteHandle | undefined)?.mobileCategories === true);
  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader mobileCategories={mobileCategories} />
      <main className="mx-auto w-full max-w-360">
        <Outlet />
      </main>
    </div>
  );
}
