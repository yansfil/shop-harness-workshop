import type { EventSummary } from "@grabmarket/contracts";
import { useState } from "react";
import { Link } from "react-router";
import { Icon } from "./icon.tsx";

const ARROW =
  "absolute top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-pill border border-line bg-ground text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:size-12";

/**
 * 홈 맨 위 배너. 한 번에 한 기획전을 보이고, 좌우 버튼과 점으로 넘긴다(자동 넘김 없음).
 * 배너를 누르면 그 기획전 상세로 간다. 글자는 사진 위에 얹는다: 데스크톱은 왼쪽 빈 곳에 진한 글자, 모바일은 아래 어두운 그라데이션 위에 흰 글자.
 */
export function EventBanner({ events }: { events: EventSummary[] }) {
  const [index, setIndex] = useState(0);
  const current = events[index];
  if (current === undefined) return null;
  const many = events.length > 1;
  const go = (step: number) => {
    setIndex((value) => (value + step + events.length) % events.length);
  };

  return (
    <section aria-roledescription="carousel" aria-label="기획전 배너" className="relative h-70 overflow-hidden bg-canvas md:h-100">
      <Link to={`/events/${current.slug}`} aria-label={`${current.title} 기획전 보기`} className="absolute inset-0 block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink">
        <img src={current.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: "78% center" }} />
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-38 bg-linear-to-b from-transparent to-scrim md:hidden" />
        <span className="absolute inset-x-4 bottom-4 flex flex-col gap-0.5 pr-20 text-on-dark md:inset-x-auto md:top-0 md:bottom-0 md:left-24 md:max-w-130 md:justify-center md:gap-2 md:pr-0 md:text-ink">
          <span className="text-xl leading-8 font-extrabold tracking-tight md:text-2xl md:leading-10.5">{current.title}</span>
          <span className="text-xs-plus leading-4.5 font-medium md:text-lg md:leading-7 md:text-ink-2">{current.summary}</span>
          <span className="mt-2 text-xs leading-4 font-semibold md:mt-6 md:text-sm md:leading-5 md:text-ink-2">{current.period}</span>
        </span>
      </Link>
      {many && (
        <>
          <button type="button" aria-label="이전 기획전" onClick={() => { go(-1); }} className={`${ARROW} left-2 md:left-6`}>
            <Icon name="chevronLeft" className="size-5 md:size-6" />
          </button>
          <button type="button" aria-label="다음 기획전" onClick={() => { go(1); }} className={`${ARROW} right-2 md:right-6`}>
            <Icon name="chevronRight" className="size-5 md:size-6" />
          </button>
          <div className="absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-pill bg-ground px-2 py-1.25 md:right-auto md:bottom-5 md:left-1/2 md:-translate-x-1/2 md:gap-1.5 md:px-2.5 md:py-1.5">
            {events.map((event, position) => (
              <button
                key={event.slug}
                type="button"
                aria-label={`${event.title} 배너 보기`}
                aria-current={position === index ? "true" : undefined}
                onClick={() => {
                  setIndex(position);
                }}
                className="relative flex h-3 items-center before:absolute before:-inset-1.5 before:content-['']"
              >
                <span className={`block rounded-pill bg-ink md:h-2 ${position === index ? "h-1.5 w-4 md:w-6" : "h-1.5 w-1.5 opacity-25 md:w-2"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
