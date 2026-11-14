import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

const api = installFakeApi();

const CUSTOMER = { id: 2, email: "customer1@grabmarket.test", name: "김하늘", role: "customer", phone: "010-1234-5678", address: "서울" };
const ADMIN = { id: 1, email: "admin@grabmarket.test", name: "그랩마켓 운영자", role: "admin", phone: null, address: null };

function signIn(user: typeof CUSTOMER | typeof ADMIN) {
  api.on("GET /api/auth/me", () => ({ json: { user } }));
}

async function topLine() {
  const nav = await screen.findByRole("navigation", { name: "이용 안내" });
  return within(nav)
    .getAllByRole("listitem")
    .map((item) => item.textContent);
}

describe("머리 맨 위 메뉴 줄", () => {
  it("로그인 전에는 로그인, 주문배송, 장바구니, 고객센터 순서이고 로그인은 보던 화면으로 돌아오는 주소다", async () => {
    renderApp("/category/food");
    expect(await topLine()).toEqual(["로그인", "주문배송", "장바구니", "고객센터"]);
    const nav = screen.getByRole("navigation", { name: "이용 안내" });
    expect(within(nav).getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?next=%2Fcategory%2Ffood");
    expect(within(nav).getByRole("link", { name: "주문배송" })).toHaveAttribute("href", "/orders");
    expect(within(nav).getByRole("link", { name: "장바구니" })).toHaveAttribute("href", "/cart");
    expect(within(nav).getByRole("link", { name: "고객센터" })).toHaveAttribute("href", "/help");
  });

  it("로그인 화면에서 맨 위 로그인 링크는 next를 겹치지 않고 지금 주소 그대로다", async () => {
    renderApp("/login?next=%2Forders");
    await topLine();
    expect(within(screen.getByRole("navigation", { name: "이용 안내" })).getByRole("link", { name: "로그인" })).toHaveAttribute("href", "/login?next=%2Forders");
  });

  it("고객 로그인 뒤에는 이름님(링크 아님), 로그아웃, 주문배송, 장바구니, 고객센터 순서이고 로고 줄에 이름 버튼이 없다", async () => {
    signIn(CUSTOMER);
    renderApp("/");
    expect(await topLine()).toEqual(["김하늘님", "로그아웃", "주문배송", "장바구니", "고객센터"]);
    const nav = screen.getByRole("navigation", { name: "이용 안내" });
    expect(within(nav).queryByRole("link", { name: /김하늘/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "내 메뉴" })).queryByText(/김하늘/)).not.toBeInTheDocument();
  });

  it("관리자는 이름님 다음에 관리자 화면이 붙는다", async () => {
    signIn(ADMIN);
    renderApp("/");
    expect(await topLine()).toEqual(["그랩마켓 운영자님", "관리자 화면", "로그아웃", "주문배송", "장바구니", "고객센터"]);
    expect(within(screen.getByRole("navigation", { name: "이용 안내" })).getByRole("link", { name: "관리자 화면" })).toHaveAttribute("href", "/admin/orders");
  });

  it("로그아웃을 누르면 로그아웃하고 홈으로 간다", async () => {
    signIn(CUSTOMER);
    api.on("POST /api/auth/logout", () => ({ status: 204 }));
    const router = renderApp("/cart");
    await topLine();
    await userEvent.click(within(screen.getByRole("navigation", { name: "이용 안내" })).getByRole("button", { name: "로그아웃" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(api.requests).toContain("POST /api/auth/logout");
  });

  it("관리자가 주문배송(내 주문)을 열면 관리자 계정 안내를 보인다", async () => {
    signIn(ADMIN);
    api.on("GET /api/orders", () => ({ status: 403, json: { error: { code: "FORBIDDEN", message: "고객 계정으로만 이용할 수 있습니다." } } }));
    renderApp("/orders");
    expect(await screen.findByRole("heading", { name: "관리자 계정으로는 주문할 수 없어요" })).toBeInTheDocument();
    expect(screen.queryByText("이 화면은 관리자만 볼 수 있어요")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "고객 계정으로 로그인" })).toHaveAttribute("href", "/login?next=%2Forders");
  });
});

describe("내 주문 맨 아래 메뉴", () => {
  it("고객센터 링크와 로그아웃 버튼이 있고 로그아웃하면 홈으로 간다", async () => {
    signIn(CUSTOMER);
    api.on("GET /api/orders", () => ({ json: { orders: [] } }));
    api.on("POST /api/auth/logout", () => ({ status: 204 }));
    const router = renderApp("/orders");
    const footer = await screen.findByRole("navigation", { name: "내 주문 아래 메뉴" });
    expect(within(footer).getByRole("link", { name: "고객센터" })).toHaveAttribute("href", "/help");

    await userEvent.click(within(footer).getByRole("button", { name: "로그아웃" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
    });
    expect(api.requests).toContain("POST /api/auth/logout");
  });
});
