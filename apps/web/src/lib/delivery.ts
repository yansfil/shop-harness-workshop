import type { CategorySlug } from "@grabmarket/contracts";

/** 자체 배송 뱃지 문구. 가짜 배송이라 카테고리마다 정해 둔 도착 안내를 쓴다(식품·생활은 내일, 가전·패션은 모레). */
export function deliveryLabel(category: CategorySlug): string {
  return category === "food" || category === "living" ? "내일 도착" : "모레 도착";
}
