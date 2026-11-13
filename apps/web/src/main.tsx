import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./router.tsx";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) throw new Error("#root 요소가 없습니다");

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(routes)} />
  </StrictMode>,
);
