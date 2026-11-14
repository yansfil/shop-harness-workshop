import { z } from "zod";
import { ProductSummarySchema } from "./catalog.ts";

export const EventSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/** 기획전 한 개의 머리 정보. 기간은 화면에 그대로 보이는 글자이고, 진행 중인지는 따지지 않는다. */
export const EventSummarySchema = z.object({
  slug: EventSlugSchema,
  title: z.string(),
  /** 소개 한 줄 */
  summary: z.string(),
  /** 예: "11월 14일 ~ 11월 30일" */
  period: z.string(),
  /** 예: /images/events/banner-winter-ready.webp */
  bannerUrl: z.string(),
  productCount: z.number().int().nonnegative(),
});
export type EventSummary = z.infer<typeof EventSummarySchema>;

/** GET /api/events (로그인 불필요). 기획전을 보여 줄 순서대로 준다. */
export const EventListResponseSchema = z.object({ events: z.array(EventSummarySchema) });
export type EventListResponse = z.infer<typeof EventListResponseSchema>;

export const EventParamsSchema = z.object({ slug: EventSlugSchema });

/** GET /api/events/:slug (로그인 불필요). 상품은 기획전이 정한 순서이고, 없는 slug는 404 NOT_FOUND */
export const EventDetailResponseSchema = z.object({
  event: EventSummarySchema,
  products: z.array(ProductSummarySchema),
});
export type EventDetailResponse = z.infer<typeof EventDetailResponseSchema>;
