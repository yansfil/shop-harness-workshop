export interface ProductStoryPoint {
  title: string;
  body: string;
}

/** 기본 상품 하나의 상세 글. 옵션이 달라도 같은 글을 쓰고, 옵션마다 한 줄만 따로 둔다. */
export interface ProductStory {
  /** 기본 상품 key(products.base_key). 예: "jeju-tangerine" */
  baseKey: string;
  /** 한 줄 소개. 시드가 products.description에 넣는다. */
  tagline: string;
  eyebrow: string;
  /** 줄바꿈(\n)으로 두 줄에 나눠 쓴다. */
  headline: string;
  intro: string;
  points: readonly ProductStoryPoint[];
  care: { title: string; body: string };
  /** 상품정보 표의 [이름, 내용] 줄들. 상품명 줄은 화면이 붙인다. */
  info: readonly (readonly [string, string])[];
  /** 옵션 이름 -> 옵션마다 한 줄. 키는 카탈로그의 옵션 이름과 같다. */
  variantNotes: Readonly<Record<string, string>>;
}

export interface ProductStoryRepository {
  findByBaseKey(baseKey: string): ProductStory | undefined;
}
