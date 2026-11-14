import type { EventDetailResponse, ProductSearchResponse } from "@grabmarket/contracts";
import { useLoaderData } from "react-router";
import { streamed } from "../lib/streamed.ts";
import { callApi } from "../api/client.ts";
import { EventBanner } from "../components/event-banner.tsx";
import { EventRow } from "../components/event-row.tsx";
import { Loaded } from "../components/loaded.tsx";
import { ProductGrid, ProductGridSkeleton } from "../components/product-card.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { ProductListHeading } from "./product-list.tsx";

export function homeLoader() {
  const events = callApi("listEvents");
  // 기획전 줄은 목록을 받은 뒤 기획전마다 상세(상품 카드)를 받아 만든다.
  const rows = events.then(({ events: list }) => Promise.all(list.map((event) => callApi("getEvent", { params: { slug: event.slug } }))));
  return { events: streamed(events), rows: streamed(rows), result: streamed(callApi("searchProducts", { query: {} })) };
}

export function HomePage() {
  const { events, rows, result } = useLoaderData<typeof homeLoader>();
  return (
    <>
      <Loaded resolve={events} failure="기획전을 불러오지 못했어요" skeleton={<div aria-hidden="true" className="h-70 animate-pulse bg-line md:h-100" />}>
        {(data) => <EventBanner events={data.events} />}
      </Loaded>
      <div className="flex flex-col gap-8 px-4 pt-6 pb-8 md:gap-12 md:px-8 md:pt-12">
        <Loaded resolve={rows} failure="기획전 상품을 불러오지 못했어요" skeleton={<EventRowSkeleton />}>
          {(details: EventDetailResponse[]) => (
            <>
              {details.map((detail) => (
                <EventRow key={detail.event.slug} {...detail} />
              ))}
            </>
          )}
        </Loaded>
        <section className="border-t border-line pt-6 md:pt-8">
          <Loaded
            resolve={result}
            failure="상품을 불러오지 못했어요"
            skeleton={
              <>
                <ProductListHeading title="전체 상품" />
                <ProductGridSkeleton />
              </>
            }
          >
            {(data: ProductSearchResponse) => (
              <>
                <ProductListHeading title="전체 상품" count={data.total} />
                {data.products.length === 0 ? (
                  <EmptyState title="아직 등록된 상품이 없어요" hint="상품이 올라오면 여기에 보여요" />
                ) : (
                  <ProductGrid products={data.products} />
                )}
              </>
            )}
          </Loaded>
        </section>
      </div>
    </>
  );
}

function EventRowSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <Bone className="h-6 w-1/3" />
      <Bone className="h-48 w-full" />
    </div>
  );
}
