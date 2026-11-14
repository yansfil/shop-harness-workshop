import { type EventSummary, EventParamsSchema } from "@grabmarket/contracts";
import { Link, type LoaderFunctionArgs, useLoaderData } from "react-router";
import { callApi } from "../api/client.ts";
import { LinkButton } from "../components/button.tsx";
import { Icon } from "../components/icon.tsx";
import { Loaded } from "../components/loaded.tsx";
import { ProductGrid, ProductGridSkeleton } from "../components/product-card.tsx";
import { Bone, EmptyState } from "../components/states.tsx";
import { streamed } from "../lib/streamed.ts";

export function eventsLoader() {
  return { result: streamed(callApi("listEvents")) };
}

export function EventsPage() {
  const { result } = useLoaderData<typeof eventsLoader>();
  return (
    <div className="px-4 py-6 md:px-8 md:py-12">
      <Loaded
        resolve={result}
        failure="기획전을 불러오지 못했어요"
        skeleton={
          <>
            <EventsHeading />
            <EventCardSkeletons />
          </>
        }
      >
        {({ events }) => (
          <>
            <EventsHeading count={events.length} />
            {events.length === 0 ? (
              <EmptyState title="진행 중인 기획전이 없어요" hint="기획전이 열리면 여기에 보여요" />
            ) : (
              <ul className="grid gap-x-6 gap-y-8 md:grid-cols-2 md:gap-y-10">
                {events.map((event) => (
                  <li key={event.slug}>
                    <EventCard event={event} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Loaded>
    </div>
  );
}

function EventsHeading({ count }: { count?: number }) {
  return (
    <h1 className="mb-6 flex items-baseline gap-2 text-xl leading-8 font-extrabold tracking-tight text-ink md:text-2xl md:leading-10">
      기획전
      {count !== undefined && <span className="text-sm leading-5 font-medium tracking-normal text-ink-3">{count}개</span>}
    </h1>
  );
}

function EventCard({ event }: { event: EventSummary }) {
  return (
    <Link to={`/events/${event.slug}`} className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
      <div className="aspect-[8/3] overflow-hidden rounded-md border border-line bg-canvas">
        <img src={event.bannerUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      </div>
      <div className="flex flex-col gap-1 pt-3">
        <span className="text-lg leading-7 font-extrabold tracking-tight text-ink">{event.title}</span>
        <span className="text-sm leading-5 font-medium text-ink-2">{event.summary}</span>
        <span className="mt-0.5 flex items-center gap-2 text-xs-plus leading-4.5 font-medium text-ink-3">
          <span>{event.period}</span>
          <span aria-hidden="true" className="size-0.75 rounded-pill bg-ink-3" />
          <span>상품 {event.productCount}개</span>
        </span>
      </div>
    </Link>
  );
}

function EventCardSkeletons() {
  return (
    <ul aria-hidden="true" className="grid gap-x-6 gap-y-8 md:grid-cols-2 md:gap-y-10">
      {Array.from({ length: 4 }, (_, index) => (
        <li key={index} className="flex flex-col gap-3">
          <div className="aspect-[8/3] animate-pulse rounded-md bg-line" />
          <Bone className="h-6 w-1/2" />
          <Bone className="h-4 w-3/4" />
        </li>
      ))}
    </ul>
  );
}

export function eventLoader({ params }: LoaderFunctionArgs) {
  const parsed = EventParamsSchema.safeParse(params);
  // 주소 모양이 맞지 않는 slug도 서버가 없는 기획전으로 답하게 한다.
  const slug = parsed.success ? parsed.data.slug : "not-found";
  return { result: streamed(callApi("getEvent", { params: { slug } })) };
}

export function EventPage() {
  const { result } = useLoaderData<typeof eventLoader>();
  return (
    <Loaded
      resolve={result}
      failure="기획전을 불러오지 못했어요"
      skeleton={
        <>
          <div aria-hidden="true" className="h-70 animate-pulse bg-line md:h-100" />
          <div className="px-4 pt-6 md:px-8 md:pt-12">
            <ProductGridSkeleton columns="four" count={8} />
          </div>
        </>
      }
      notFound={
        <EmptyState title="기획전을 찾을 수 없어요" hint="주소를 다시 확인하거나 다른 기획전을 둘러보세요">
          <LinkButton to="/events" size="lg">
            기획전 목록 보기
          </LinkButton>
        </EmptyState>
      }
    >
      {({ event, products }) => (
        <>
          <section aria-label="기획전 머리" className="relative h-70 overflow-hidden bg-canvas md:h-100">
            <img src={event.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: "80% center" }} />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-42 bg-linear-to-b from-transparent to-scrim md:hidden" />
            <Link
              to="/events"
              className="absolute top-3 left-4 flex items-center gap-0.5 rounded-pill bg-ground py-1 pr-2.5 pl-1.5 text-xs-plus leading-4.5 font-semibold text-ink-2 md:hidden"
            >
              <Icon name="chevronLeft" className="size-4" />
              기획전
            </Link>
            <div className="absolute inset-x-4 bottom-4 flex flex-col gap-0.5 text-on-dark md:inset-x-auto md:top-0 md:bottom-0 md:left-24 md:max-w-130 md:justify-center md:gap-2 md:text-ink">
              <Link to="/events" className="mb-2 hidden items-center gap-0.5 text-sm leading-5 font-semibold text-ink-2 md:flex">
                <Icon name="chevronLeft" className="size-4.5" />
                기획전
              </Link>
              <h1 className="text-xl leading-8 font-extrabold tracking-tight md:text-2xl md:leading-10.5">{event.title}</h1>
              <p className="text-xs-plus leading-4.5 font-medium md:text-lg md:leading-7 md:text-ink-2">{event.summary}</p>
              <p className="mt-2 text-xs leading-4 font-semibold md:mt-6 md:text-sm md:leading-5 md:text-ink-2">{event.period}</p>
            </div>
          </section>
          <section aria-labelledby="event-products" className="px-4 pt-6 pb-8 md:px-8 md:pt-12">
            <h2 id="event-products" className="mb-3 flex items-baseline gap-2 text-base leading-6 font-extrabold text-ink md:mb-4 md:text-lg md:leading-7">
              기획전 상품
              <span className="text-xs-plus leading-4.5 font-medium text-ink-3 md:text-sm md:leading-5">{products.length}개</span>
            </h2>
            <ProductGrid products={products} columns="four" />
          </section>
        </>
      )}
    </Loaded>
  );
}
