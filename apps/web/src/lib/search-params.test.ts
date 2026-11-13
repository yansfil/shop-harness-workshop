import { describe, expect, it } from "vitest";
import { checkedBuckets, hasFilters, parseSearchParams, toggleBucket } from "./search-params.ts";

describe("가격 구간", () => {
  it("구간을 켜면 그 구간의 가격 범위가 된다", () => {
    expect(toggleBucket({}, 1)).toEqual({ minPrice: 10_000, maxPrice: 19_999 });
    expect(toggleBucket({}, 0)).toEqual({ maxPrice: 9_999 });
    expect(toggleBucket({}, 3)).toEqual({ minPrice: 30_000 });
  });

  it("이어진 구간은 합치고 떨어진 구간을 켜면 그 구간 하나로 바꾼다", () => {
    expect(toggleBucket({ minPrice: 10_000, maxPrice: 19_999 }, 2)).toEqual({ minPrice: 10_000, maxPrice: 29_999 });
    expect(toggleBucket({ maxPrice: 9_999 }, 3)).toEqual({ minPrice: 30_000 });
  });

  it("켜 둔 구간을 다시 누르면 꺼지고, 모두 꺼지면 가격 조건이 없다", () => {
    expect(toggleBucket({ minPrice: 10_000, maxPrice: 19_999 }, 1)).toEqual({});
    expect(checkedBuckets({ minPrice: 10_000, maxPrice: 29_999 })).toEqual([1, 2]);
  });
});

describe("검색 조건 주소", () => {
  it("모양이 틀리면 null이다", () => {
    expect(parseSearchParams(new URLSearchParams("category=beauty"))).toBeNull();
    expect(parseSearchParams(new URLSearchParams("minPrice=5000&maxPrice=1000"))).toBeNull();
  });

  it("필터는 카테고리·가격·품절 제외이고 검색어와 정렬은 필터가 아니다", () => {
    const parsed = (search: string) => {
      const result = parseSearchParams(new URLSearchParams(search));
      if (result === null) throw new Error("검사에 실패했습니다");
      return result.query;
    };
    expect(hasFilters(parsed("q=귤&sort=price_asc"))).toBe(false);
    expect(hasFilters(parsed("q=귤&excludeSoldOut=true"))).toBe(true);
    expect(hasFilters(parsed("category=food"))).toBe(true);
  });
});
