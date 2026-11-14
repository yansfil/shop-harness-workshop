import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { installFakeApi } from "../test/fake-api.ts";
import { renderApp } from "../test/render-app.tsx";

const api = installFakeApi();

function rowText(name: RegExp) {
  return screen.getByRole("row", { name }).textContent;
}

describe("고객센터", () => {
  it("배송비 숫자는 서버의 배송비 규칙 값에서 온다", async () => {
    api.on("GET /api/shipping-policy", () => ({ json: { fee: 4_000, freeThreshold: 50_000 } }));
    renderApp("/help");
    expect(await screen.findByText("50,000원 이상 주문하면 무료, 그 밖에는 4,000원")).toBeInTheDocument();
  });

  it("도착·배송 상태 순서·교환과 반품·내 주문 보기·교육용 안내를 보인다", async () => {
    api.on("GET /api/shipping-policy", () => ({ json: { fee: 3_000, freeThreshold: 30_000 } }));
    renderApp("/help");
    expect(await screen.findByRole("heading", { level: 1, name: "고객센터" })).toBeInTheDocument();
    expect(screen.getByText("배송과 교환·반품 안내를 모았어요")).toBeInTheDocument();
    expect(await screen.findByText("30,000원 이상 주문하면 무료, 그 밖에는 3,000원")).toBeInTheDocument();
    expect(rowText(/^도착/)).toBe("도착식품·생활은 내일, 가전·패션은 모레 도착해요");
    expect(within(screen.getByRole("list", { name: "배송 상태 순서" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "결제완료",
      "배송준비",
      "배송중",
      "배송완료",
    ]);
    expect(rowText(/^신청 기간/)).toBe("신청 기간받은 날부터 7일 안에 알려 주세요");
    expect(rowText(/^안 되는 경우/)).toBe("안 되는 경우신선식품은 단순 변심으로 교환·반품할 수 없어요");
    expect(screen.getByRole("link", { name: "내 주문 보기" })).toHaveAttribute("href", "/orders");
    expect(screen.getByText("그랩마켓은 가상의 교육용 쇼핑몰이에요. 실제 결제와 배송은 이뤄지지 않아요.")).toBeInTheDocument();
    expect(screen.queryByText(/전화|상담 시간|1:1|회원가입|매장|최근 본/)).not.toBeInTheDocument();
  });
});
