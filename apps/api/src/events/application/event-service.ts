import { notFound } from "../../shared/domain/domain-error.ts";
import type { CatalogService } from "../../catalog/application/catalog-service.ts";
import type { Product } from "../../catalog/domain/product.ts";
import type { Event, EventRepository } from "../domain/event.ts";

export interface EventDetail {
  event: Event;
  products: Product[];
}

export class EventService {
  readonly #events: EventRepository;
  readonly #catalog: CatalogService;

  constructor(events: EventRepository, catalog: CatalogService) {
    this.#events = events;
    this.#catalog = catalog;
  }

  list(): readonly Event[] {
    return this.#events.list();
  }

  /** 없는 slug는 NOT_FOUND. 기획전이 가리키는 상품이 상품 저장소에 없으면 데이터가 어긋난 것이라 그대로 오류로 올린다. */
  getDetail(slug: string): EventDetail {
    const event = this.#events.findBySlug(slug);
    if (event === undefined) throw notFound("기획전");
    return { event, products: this.#catalog.getProductsByVariant(event.products) };
  }
}
