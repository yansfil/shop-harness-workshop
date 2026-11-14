export interface EventProductRef {
  /** 기본 상품 key. 예: "jeju-tangerine" */
  baseKey: string;
  /** 변형 이름. 예: "3kg" */
  optionLabel: string;
}

export interface Event {
  slug: string;
  title: string;
  summary: string;
  /** 화면에 그대로 보이는 기간 글자. 진행 상태는 계산하지 않는다. */
  period: string;
  bannerPath: string;
  /** 기획전이 정한 순서 */
  products: readonly EventProductRef[];
}

export interface EventRepository {
  /** 보여 줄 순서대로 */
  list(): readonly Event[];
  findBySlug(slug: string): Event | undefined;
}
