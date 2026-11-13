import { describe, expect, it } from "vitest";
import { splitByQuery } from "./highlight.ts";

describe("splitByQuery", () => {
  it("친 글자가 나오는 곳을 모두 나눈다", () => {
    expect(splitByQuery("감귤 젤리 귤", "귤")).toEqual([
      { text: "감", match: false },
      { text: "귤", match: true },
      { text: " 젤리 ", match: false },
      { text: "귤", match: true },
    ]);
  });

  it("대소문자를 가리지 않고 원래 글자를 그대로 돌려준다", () => {
    expect(splitByQuery("USB-C 충전기", "usb")).toEqual([
      { text: "USB", match: true },
      { text: "-C 충전기", match: false },
    ]);
  });

  it("일치가 없거나 검색어가 비면 통째로 한 덩어리다", () => {
    expect(splitByQuery("백미 4kg", "귤")).toEqual([{ text: "백미 4kg", match: false }]);
    expect(splitByQuery("백미 4kg", "  ")).toEqual([{ text: "백미 4kg", match: false }]);
  });
});
