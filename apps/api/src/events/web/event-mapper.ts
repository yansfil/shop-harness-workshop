import type { EventDetailResponse, EventListResponse, EventSummary } from "@grabmarket/contracts";
import { toProductSummaryDto } from "../../catalog/web/catalog-mapper.ts";
import type { EventDetail } from "../application/event-service.ts";
import type { Event } from "../domain/event.ts";

export function toEventSummaryDto(event: Event): EventSummary {
  return {
    slug: event.slug,
    title: event.title,
    summary: event.summary,
    period: event.period,
    bannerUrl: event.bannerPath,
    productCount: event.products.length,
  };
}

export function toEventListDto(events: readonly Event[]): EventListResponse {
  return { events: events.map(toEventSummaryDto) };
}

export function toEventDetailDto({ event, products }: EventDetail): EventDetailResponse {
  return { event: toEventSummaryDto(event), products: products.map(toProductSummaryDto) };
}
