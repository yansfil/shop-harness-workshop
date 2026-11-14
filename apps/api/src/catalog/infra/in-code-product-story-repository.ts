import type { ProductStory, ProductStoryRepository } from "../domain/product-story.ts";
import { PRODUCT_STORIES } from "./product-story-data.ts";

/** 상품 상세 글을 코드 안의 목록에서 읽는다. */
export class InCodeProductStoryRepository implements ProductStoryRepository {
  readonly #stories: ReadonlyMap<string, ProductStory>;

  constructor(stories: readonly ProductStory[] = PRODUCT_STORIES) {
    this.#stories = new Map(stories.map((story) => [story.baseKey, story]));
  }

  findByBaseKey(baseKey: string): ProductStory | undefined {
    return this.#stories.get(baseKey);
  }
}
