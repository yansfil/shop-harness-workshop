// 상품 40개(기본 상품) × 변형 = 120개. 한 줄 소개(products.description)는 상품 상세 글의 tagline을 쓴다. 이미지는 변형마다 한 장씩 apps/web/public/images/products/<key>-<변형 순번(1부터)>.webp.
import type { CategorySlug } from "../catalog/domain/product.ts";

export interface SeedBaseProduct {
  key: string;
  category: CategorySlug;
  name: string;
  /** [변형 이름, 가격(원)] */
  variants: readonly (readonly [string, number])[];
}

export const SEED_CATEGORIES: readonly { slug: CategorySlug; name: string }[] = [
  { slug: "food", name: "식품" },
  { slug: "living", name: "생활" },
  { slug: "electronics", name: "가전" },
  { slug: "fashion", name: "패션" },
];

export const SEED_PRODUCTS: readonly SeedBaseProduct[] = [
  { key: "jeju-tangerine", category: "food", name: "제주 감귤", variants: [["2kg", 12900], ["3kg", 17900], ["5kg", 27900], ["10kg", 49900]] },
  { key: "house-tangerine", category: "food", name: "하우스 감귤", variants: [["1kg", 9900], ["2kg", 18900], ["3kg", 26900]] },
  { key: "tangerine-vinegar", category: "food", name: "감귤 식초", variants: [["500ml", 8900], ["1L", 15900]] },
  { key: "tangerine-jelly", category: "food", name: "감귤 젤리", variants: [["12개입", 7900], ["24개입", 14900], ["48개입", 27900]] },
  { key: "dried-tangerine-chips", category: "food", name: "말린 감귤칩", variants: [["50g", 5900], ["100g", 10900], ["200g", 19900]] },
  { key: "tangerine-juice", category: "food", name: "감귤 주스", variants: [["500ml", 4500], ["1L", 7900], ["1L x 6", 42900]] },
  { key: "white-rice", category: "food", name: "백미", variants: [["4kg", 15900], ["10kg", 34900], ["20kg", 62900]] },
  { key: "basmati-rice", category: "food", name: "바스마티 쌀", variants: [["1kg", 8900], ["2kg", 15900]] },
  { key: "whole-wheat-bread", category: "food", name: "통밀 식빵", variants: [["1봉", 4900], ["2봉", 9500], ["4봉", 17900]] },
  { key: "eggs", category: "food", name: "무항생제 계란", variants: [["10구", 5900], ["15구", 8400], ["30구", 15900], ["60구", 29900]] },
  { key: "cotton-towel", category: "living", name: "호텔식 면 수건", variants: [["3장", 15900], ["5장", 24900], ["10장", 45900]] },
  { key: "dish-soap", category: "living", name: "주방 세제", variants: [["500ml", 3900], ["1L", 6500], ["리필 1.2L", 6900]] },
  { key: "hand-wash", category: "living", name: "핸드워시", variants: [["250ml", 4900], ["500ml", 7900], ["리필 1L", 9900]] },
  { key: "laundry-detergent", category: "living", name: "세탁 세제", variants: [["1.5L", 8900], ["3L", 14900], ["5L", 21900]] },
  { key: "toilet-paper", category: "living", name: "3겹 두루마리 휴지", variants: [["12롤", 9900], ["24롤", 17900], ["30롤", 21900]] },
  { key: "wet-wipes", category: "living", name: "순한 물티슈", variants: [["1팩", 1900], ["10팩", 14900], ["20팩", 26900]] },
  { key: "storage-basket", category: "living", name: "라탄 수납 바구니", variants: [["소", 12900], ["중", 17900], ["대", 23900]] },
  { key: "glass-container", category: "living", name: "유리 밀폐 용기", variants: [["3개 세트", 19900], ["5개 세트", 29900], ["10개 세트", 54900]] },
  { key: "toothbrush", category: "living", name: "부드러운 칫솔", variants: [["4개입", 4900], ["8개입", 8900], ["12개입", 12900]] },
  { key: "diffuser", category: "living", name: "실내 디퓨저", variants: [["100ml", 12900], ["200ml", 19900], ["300ml", 26900]] },
  { key: "wireless-headphones", category: "electronics", name: "무선 블루투스 헤드폰", variants: [["기본형", 59000], ["노이즈캔슬링형", 89000], ["프리미엄형", 129000]] },
  { key: "wireless-earbuds", category: "electronics", name: "무선 블루투스 이어폰", variants: [["기본형", 39000], ["노이즈캔슬링형", 69000], ["프리미엄형", 99000]] },
  { key: "electric-kettle", category: "electronics", name: "전기 포트", variants: [["1L", 24900], ["1.5L", 29900], ["1.7L", 34900]] },
  { key: "air-fryer", category: "electronics", name: "에어프라이어", variants: [["3L", 59000], ["5L", 79000], ["7L", 99000]] },
  { key: "cordless-vacuum", category: "electronics", name: "무선 청소기", variants: [["기본형", 129000], ["고급형", 189000], ["프리미엄형", 259000]] },
  { key: "bluetooth-speaker", category: "electronics", name: "블루투스 스피커", variants: [["소", 29000], ["중", 49000], ["대", 79000]] },
  { key: "power-bank", category: "electronics", name: "보조배터리", variants: [["10000mAh", 19900], ["20000mAh", 29900], ["30000mAh", 39900]] },
  { key: "usb-c-charger", category: "electronics", name: "USB-C 고속 충전기", variants: [["20W", 14900], ["35W", 24900], ["65W", 39900]] },
  { key: "desk-lamp", category: "electronics", name: "LED 스탠드", variants: [["기본형", 29900], ["무선충전형", 45900], ["와이드형", 54900]] },
  { key: "mini-humidifier", category: "electronics", name: "미니 가습기", variants: [["1L", 24900], ["2L", 34900], ["3L", 44900]] },
  { key: "canvas-tote", category: "fashion", name: "캔버스 에코백", variants: [["소", 12900], ["중", 15900], ["대", 18900]] },
  { key: "striped-tshirt", category: "fashion", name: "스트라이프 반팔 티셔츠", variants: [["S", 19900], ["M", 19900], ["L", 19900]] },
  { key: "grey-sweatshirt", category: "fashion", name: "그레이 맨투맨", variants: [["S", 29900], ["M", 29900], ["L", 29900]] },
  { key: "straight-jeans", category: "fashion", name: "일자 데님 바지", variants: [["28", 39900], ["30", 39900], ["32", 39900]] },
  { key: "knit-beanie", category: "fashion", name: "니트 비니", variants: [["1개", 12900], ["2개 묶음", 22900], ["3개 묶음", 31900]] },
  { key: "canvas-sneakers", category: "fashion", name: "화이트 캔버스 스니커즈", variants: [["240", 49000], ["260", 49000], ["280", 49000]] },
  { key: "cotton-socks", category: "fashion", name: "면 양말", variants: [["3켤레", 8900], ["5켤레", 13900], ["10켤레", 24900]] },
  { key: "padded-vest", category: "fashion", name: "경량 패딩 조끼", variants: [["S", 49900], ["M", 49900], ["L", 49900]] },
  { key: "wool-muffler", category: "fashion", name: "울 머플러", variants: [["180cm", 29900], ["200cm", 33900], ["220cm", 37900]] },
  { key: "card-wallet", category: "fashion", name: "가죽 카드지갑", variants: [["1개", 24900], ["2개 세트", 44900], ["3개 세트", 62900]] },
];
