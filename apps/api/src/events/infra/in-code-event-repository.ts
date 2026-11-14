import type { Event, EventRepository } from "../domain/event.ts";
import { EVENTS } from "./event-data.ts";

/** 기획전을 코드 안의 목록에서 읽는다. */
export class InCodeEventRepository implements EventRepository {
  readonly #events: readonly Event[];

  constructor(events: readonly Event[] = EVENTS) {
    this.#events = events;
  }

  list(): readonly Event[] {
    return this.#events;
  }

  findBySlug(slug: string): Event | undefined {
    return this.#events.find((event) => event.slug === slug);
  }
}
