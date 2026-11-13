import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AmountRows } from "./summary-box.tsx";

const amounts = { subtotal: 35_800, shippingFee: 3_000, total: 38_800 };

describe("금액 요약의 무료배송 안내", () => {
  it("남은 금액이 있으면 얼마를 더 담으면 무료배송인지 보인다", () => {
    render(<AmountRows amounts={{ ...amounts, freeShippingRemaining: 14_200 }} status="ready" />);

    expect(screen.getByText("14,200원 더 담으면 무료배송")).toBeInTheDocument();
  });

  it("이미 무료배송이면 안내가 없다", () => {
    render(<AmountRows amounts={{ subtotal: 50_000, shippingFee: 0, total: 50_000, freeShippingRemaining: 0 }} status="ready" />);

    expect(screen.queryByText(/더 담으면 무료배송/)).not.toBeInTheDocument();
  });

  it("금액을 아직 모르면 안내도 없다", () => {
    render(<AmountRows amounts={null} status="loading" />);

    expect(screen.queryByText(/더 담으면 무료배송/)).not.toBeInTheDocument();
  });
});
