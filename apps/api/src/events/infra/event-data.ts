// 기획전 4개. 기획전은 DB가 아니라 코드가 가진다(스키마를 바꾸지 않는다).
// 상품은 기본 상품 key와 변형 이름으로 가리키고, 이름·가격·재고는 상품 저장소가 준다.
// 기간은 화면에 그대로 보이는 글자다. 진행 중인지 판단하지 않는다.
import type { Event } from "../domain/event.ts";

export const EVENTS: readonly Event[] = [
  {
    slug: "winter-ready",
    title: "겨울 채비, 따뜻하게",
    summary: "찬 바람 불기 전에 입고 두를 것부터 챙겨요.",
    period: "11월 14일 ~ 11월 30일",
    bannerPath: "/images/events/banner-winter-ready.webp",
    products: [
      { baseKey: "padded-vest", optionLabel: "M" },
      { baseKey: "wool-muffler", optionLabel: "200cm" },
      { baseKey: "knit-beanie", optionLabel: "1개" },
      { baseKey: "grey-sweatshirt", optionLabel: "M" },
      { baseKey: "cotton-socks", optionLabel: "5켤레" },
      { baseKey: "mini-humidifier", optionLabel: "2L" },
      { baseKey: "electric-kettle", optionLabel: "1.5L" },
      { baseKey: "straight-jeans", optionLabel: "30" },
    ],
  },
  {
    slug: "tangerine-season",
    title: "제철 감귤 모음",
    summary: "상자째 받는 감귤부터 주스·젤리까지 모았어요.",
    period: "11월 10일 ~ 12월 7일",
    bannerPath: "/images/events/banner-tangerine-season.webp",
    products: [
      { baseKey: "jeju-tangerine", optionLabel: "3kg" },
      { baseKey: "jeju-tangerine", optionLabel: "5kg" },
      { baseKey: "house-tangerine", optionLabel: "2kg" },
      { baseKey: "tangerine-juice", optionLabel: "1L" },
      { baseKey: "tangerine-jelly", optionLabel: "24개입" },
      { baseKey: "dried-tangerine-chips", optionLabel: "100g" },
      { baseKey: "tangerine-vinegar", optionLabel: "500ml" },
      { baseKey: "jeju-tangerine", optionLabel: "10kg" },
    ],
  },
  {
    slug: "tidy-home",
    title: "집 정리 한 번에",
    summary: "수납 바구니와 세제, 수건까지 한곳에서 골라요.",
    period: "11월 12일 ~ 12월 14일",
    bannerPath: "/images/events/banner-tidy-home.webp",
    products: [
      { baseKey: "storage-basket", optionLabel: "중" },
      { baseKey: "glass-container", optionLabel: "5개 세트" },
      { baseKey: "laundry-detergent", optionLabel: "3L" },
      { baseKey: "dish-soap", optionLabel: "1L" },
      { baseKey: "cotton-towel", optionLabel: "5장" },
      { baseKey: "diffuser", optionLabel: "200ml" },
      { baseKey: "toilet-paper", optionLabel: "24롤" },
      { baseKey: "hand-wash", optionLabel: "500ml" },
    ],
  },
  {
    slug: "desk-gadgets",
    title: "책상 위 작은 가전",
    summary: "오래 앉는 자리를 편하게 해 줄 가전을 골랐어요.",
    period: "11월 14일 ~ 12월 20일",
    bannerPath: "/images/events/banner-desk-gadgets.webp",
    products: [
      { baseKey: "desk-lamp", optionLabel: "무선충전형" },
      { baseKey: "wireless-earbuds", optionLabel: "노이즈캔슬링형" },
      { baseKey: "wireless-headphones", optionLabel: "기본형" },
      { baseKey: "bluetooth-speaker", optionLabel: "소" },
      { baseKey: "power-bank", optionLabel: "10000mAh" },
      { baseKey: "usb-c-charger", optionLabel: "35W" },
      { baseKey: "mini-humidifier", optionLabel: "1L" },
      { baseKey: "electric-kettle", optionLabel: "1L" },
    ],
  },
];
