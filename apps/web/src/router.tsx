import type { RouteObject } from "react-router";
import { HomePage } from "./routes/home-page.tsx";
import { NotFoundPage } from "./routes/not-found-page.tsx";

/** 화면 경로 표. 화면을 더할 때 여기에 한 줄씩 더한다. */
export const routes: RouteObject[] = [
  { path: "/", element: <HomePage /> },
  { path: "*", element: <NotFoundPage /> },
];
