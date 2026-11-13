import { render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { cartStore } from "../state/cart.ts";
import { recentSearchStore } from "../state/recent-searches.ts";
import { routes } from "../router.tsx";

/** 실제 경로 표로 앱을 그린다. 저장소(localStorage)는 먼저 비우고 다시 읽는다. */
export function renderApp(path: string, saved: { recent?: string[] } = {}) {
  localStorage.clear();
  if (saved.recent !== undefined) localStorage.setItem("grabmarket.recent-searches", JSON.stringify(saved.recent));
  cartStore.reload();
  recentSearchStore.reload();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
