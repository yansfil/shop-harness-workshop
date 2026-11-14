import type { CategorySlug } from "@grabmarket/contracts";

export type DeliveryDay = "내일" | "모레";

/** 가짜 배송이라 카테고리마다 도착 날을 정해 둔다(식품·생활은 내일, 가전·패션은 모레). 상품 카드 뱃지와 고객센터가 이 기준을 쓴다. */
export function deliveryDay(category: CategorySlug): DeliveryDay {
  return category === "food" || category === "living" ? "내일" : "모레";
}

/** 자체 배송 뱃지 문구 */
export function deliveryLabel(category: CategorySlug): string {
  return `${deliveryDay(category)} 도착`;
}
