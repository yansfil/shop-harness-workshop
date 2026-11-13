import type { Category, CurrentUser } from "@grabmarket/contracts";
import { useRouteLoaderData } from "react-router";

export const ROOT_ROUTE_ID = "root";

/** 모든 화면이 공유하는 데이터: 로그인한 사람(없으면 null)과 카테고리 4개. */
export interface RootData {
  user: CurrentUser | null;
  categories: Category[];
}

export function useRootData(): RootData {
  const data = useRouteLoaderData<RootData | undefined>(ROOT_ROUTE_ID);
  if (data === undefined) throw new Error("root 로더 데이터가 없습니다. 화면은 root 경로 아래에서만 그려집니다.");
  return data;
}
