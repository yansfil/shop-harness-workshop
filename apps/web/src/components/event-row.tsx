import type { EventDetailResponse } from "@grabmarket/contracts";
import { Link } from "react-router";
import { Icon } from "./icon.tsx";
import { ProductCard } from "./product-card.tsx";

const ROW_COUNT = 5;

/** 홈의 기획전 상품 줄: 제목·소개 한 줄과 "전체 보기", 그 아래 상품 카드 5개. 모바일은 줄 안에서만 가로로 민다. */
export function EventRow({ event, products }: EventDetailResponse) {
  return (
    <section aria-labelledby={`event-row-${event.slug}`} className="flex flex-col gap-3 md:gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`event-row-${event.slug}`} className="text-base leading-6 font-extrabold tracking-tight text-ink md:text-lg md:leading-7">
            {event.title}
          </h2>
          <p className="truncate text-xs-plus leading-4.5 font-medium text-ink-3 md:text-sm md:leading-5">{event.summary}</p>
        </div>
        <Link to={`/events/${event.slug}`} aria-label={`${event.title} 전체 보기`} className="flex shrink-0 items-center gap-0.5 text-xs-plus font-semibold text-ink-2 md:text-sm">
          전체 보기
          <Icon name="chevronRight" className="size-4.5" />
        </Link>
      </div>
      <ul className="-mr-4 flex gap-2 overflow-x-auto pr-4 [scrollbar-width:none] md:mr-0 md:grid md:grid-cols-4 md:gap-3 md:overflow-visible md:pr-0 lg:grid-cols-5">
        {products.slice(0, ROW_COUNT).map((product) => (
          <li key={product.id} className="w-37 shrink-0 md:w-auto md:max-lg:last:hidden">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
