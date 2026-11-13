import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "./router.tsx";

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe("router", () => {
  it("홈에서 그랩마켓 제목을 보인다", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: "그랩마켓" })).toBeInTheDocument();
  });

  it("없는 경로는 찾을 수 없음 안내와 홈 링크를 보인다", () => {
    renderAt("/nope");
    expect(screen.getByRole("heading", { name: "페이지를 찾을 수 없습니다." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈으로 가기" })).toHaveAttribute("href", "/");
  });
});
