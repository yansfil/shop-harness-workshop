import { describe, expect, it } from "vitest";
import { pageWindow } from "./pagination.ts";

describe("pageWindow", () => {
  it("7쪽까지는 모든 번호를 준다", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("앞쪽에서는 1~5쪽과 끝 쪽을, 뒤쪽에서는 처음 쪽과 끝 5쪽을 준다", () => {
    expect(pageWindow(1, 115)).toEqual([1, 2, 3, 4, 5, "gap", 115]);
    expect(pageWindow(4, 115)).toEqual([1, 2, 3, 4, 5, "gap", 115]);
    expect(pageWindow(112, 115)).toEqual([1, "gap", 111, 112, 113, 114, 115]);
  });

  it("가운데에서는 지금 쪽 앞뒤 한 쪽씩만 보인다", () => {
    expect(pageWindow(50, 115)).toEqual([1, "gap", 49, 50, 51, "gap", 115]);
  });
});
