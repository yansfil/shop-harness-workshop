import { describe, expect, it } from "vitest";
import { formatWon, multiplyMoney, sumMoney, won } from "./money.ts";

describe("Money", () => {
  it("단가 × 수량과 합계를 정수 원으로 계산한다", () => {
    const lines = [multiplyMoney(won(12900), 3), multiplyMoney(won(4500), 2)];
    expect(sumMoney(lines)).toBe(47700);
  });

  it("소수·음수 금액은 거절한다", () => {
    expect(() => won(0.1 + 0.2)).toThrow("정수 원");
    expect(() => won(-1)).toThrow("정수 원");
  });

  it("화면 표기는 천 단위 쉼표와 원을 붙인다", () => {
    expect(formatWon(won(1234500))).toBe("1,234,500원");
  });
});
