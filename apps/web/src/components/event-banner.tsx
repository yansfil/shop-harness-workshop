import type { EventSummary } from "@grabmarket/contracts";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import { Icon } from "./icon.tsx";

const ARROW =
  "absolute top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-pill border border-line bg-ground text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:size-12";

/** 자동으로 다음 배너로 넘기기까지 기다리는 시간. 버튼·점으로 넘기거나 멈춤이 풀리면 다시 센다. */
const AUTO_MS = 5000;
/** 옆으로 미끄러지는 시간. 끝난 뒤에는 지나온 배너를 화면 구조에서 걷어 낸다. */
const SLIDE_MS = 500;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * `pos`는 줄어들거나 끝없이 커질 수 있는 가로 칸 번호이고, `lo`~`hi`는 트랙이 멈출 때까지 화면에 걸칠 수 있어 그려 두는 칸이다.
 * `epoch`는 넘김마다 올라가 5초를 새로 세게 한다.
 */
type Nav = { pos: number; lo: number; hi: number; epoch: number };

const wrap = (value: number, size: number) => ((value % size) + size) % size;

/** 새 칸으로 넘긴다. 미끄러지는 중에 다시 넘겨도 지나온 칸을 지우지 않고, 그려 둘 칸은 기획전 수를 넘기지 않는다(같은 기획전이 두 번 그려지지 않게). */
function moveTo(nav: Nav, target: number, size: number): Nav {
  let { lo, hi } = nav;
  lo = Math.min(lo, target);
  hi = Math.max(hi, target);
  if (hi - lo + 1 > size) {
    if (target > nav.pos) lo = hi - size + 1;
    else hi = lo + size - 1;
  }
  return { pos: target, lo, hi, epoch: nav.epoch + 1 };
}

function subscribeReducedMotion(notify: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", notify);
  return () => {
    query.removeEventListener("change", notify);
  };
}
const reducedMotionNow = () => window.matchMedia(REDUCED_MOTION).matches;

function subscribeTabVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => {
    document.removeEventListener("visibilitychange", notify);
  };
}
const tabHiddenNow = () => document.hidden;

function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 fill-current md:size-4">
      <path d={paused ? "M8 5v14l11-7z" : "M6 5h4v14H6zM14 5h4v14h-4z"} />
    </svg>
  );
}

/**
 * 홈 맨 위 배너. 한 번에 한 기획전을 보이고, 5초마다 옆으로 약 0.5초 미끄러져 다음 기획전으로 넘어간다(마지막 다음은 같은 방향으로 첫 배너).
 * 마우스를 올렸거나, 키보드 초점이 배너 안에 있거나, 탭이 가려졌거나, 일시정지를 눌렀으면 멈춘다. 동작 줄이기를 켠 사용자에게는 자동 넘김과 미끄러짐 없이 바로 바뀐다.
 * 좌우 버튼과 점으로 넘기면 그 배너로 가고 5초를 새로 센다. 배너를 누르면 그 기획전 상세로 간다.
 * 글자는 사진 위에 얹는다: 데스크톱은 왼쪽 빈 곳에 진한 글자, 모바일은 아래 어두운 그라데이션 위에 흰 글자.
 */
export function EventBanner({ events }: { events: EventSummary[] }) {
  const [nav, setNav] = useState<Nav>({ pos: 0, lo: 0, hi: 0, epoch: 0 });
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, reducedMotionNow);
  const tabHidden = useSyncExternalStore(subscribeTabVisibility, tabHiddenNow);
  const size = events.length;
  const many = size > 1;
  const playing = many && !reducedMotion && !userPaused && !hovered && !focused && !tabHidden;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      setNav((value) => moveTo(value, value.pos + 1, size));
    }, AUTO_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [playing, nav.epoch, size]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNav((value) => (value.lo === value.pos && value.hi === value.pos ? value : { ...value, lo: value.pos, hi: value.pos }));
    }, SLIDE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [nav.pos]);

  if (size === 0) return null;
  const index = wrap(nav.pos, size);
  const move = (next: (pos: number) => number) => {
    setNav((value) => moveTo(value, next(value.pos), size));
  };
  const slots = Array.from({ length: nav.hi - nav.lo + 1 }, (_, offset) => nav.lo + offset);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="기획전 배너"
      className="relative h-70 overflow-hidden bg-canvas md:h-100"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div
        aria-live={playing ? "off" : "polite"}
        className="absolute inset-0 transition-transform ease-in-out"
        style={{ transform: `translateX(${String(-nav.pos * 100)}%)`, transitionDuration: reducedMotion ? "0ms" : `${String(SLIDE_MS)}ms` }}
      >
        {slots.map((slot) => {
          const current = events[wrap(slot, size)];
          if (current === undefined) throw new Error(`배너 칸 ${String(slot)}에 맞는 기획전이 없습니다`);
          const active = slot === nav.pos;
          return (
            <Link
              key={slot}
              to={`/events/${current.slug}`}
              aria-label={`${current.title} 기획전 보기`}
              aria-hidden={active ? undefined : true}
              inert={!active}
              style={{ left: `${String(slot * 100)}%` }}
              className="absolute top-0 block h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
            >
              <img src={current.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: "78% center" }} />
              <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-38 bg-linear-to-b from-transparent to-scrim md:hidden" />
              <span className="absolute inset-x-4 bottom-4 flex flex-col gap-0.5 pr-28 text-on-dark md:inset-x-auto md:top-0 md:bottom-0 md:left-24 md:max-w-130 md:justify-center md:gap-2 md:pr-0 md:text-ink">
                <span className="text-xl leading-8 font-extrabold tracking-tight md:text-2xl md:leading-10.5">{current.title}</span>
                <span className="text-xs-plus leading-4.5 font-medium md:text-lg md:leading-7 md:text-ink-2">{current.summary}</span>
                <span className="mt-2 text-xs leading-4 font-semibold md:mt-6 md:text-sm md:leading-5 md:text-ink">{current.period}</span>
              </span>
            </Link>
          );
        })}
      </div>
      {many && (
        <>
          <button type="button" aria-label="이전 기획전" onClick={() => { move((pos) => pos - 1); }} className={`${ARROW} left-2 md:left-6`}>
            <Icon name="chevronLeft" className="size-5 md:size-6" />
          </button>
          <button type="button" aria-label="다음 기획전" onClick={() => { move((pos) => pos + 1); }} className={`${ARROW} right-2 md:right-6`}>
            <Icon name="chevronRight" className="size-5 md:size-6" />
          </button>
          <div className="absolute right-4 bottom-4 z-10 flex items-center gap-1 rounded-pill bg-ground px-2 py-1.25 md:right-auto md:bottom-5 md:left-1/2 md:-translate-x-1/2 md:gap-1.5 md:px-2.5 md:py-1.5">
            {!reducedMotion && (
              <button
                type="button"
                aria-label={userPaused ? "자동 넘김 켜기" : "자동 넘김 멈추기"}
                onClick={() => {
                  setUserPaused((value) => !value);
                }}
                className="relative mr-1 flex size-4 items-center justify-center rounded-pill text-ink before:absolute before:-inset-x-0.5 before:-inset-y-1 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:mr-1.5 md:size-5"
              >
                <PauseIcon paused={userPaused} />
              </button>
            )}
            {events.map((event, position) => (
              <button
                key={event.slug}
                type="button"
                aria-label={`${event.title} 배너 보기`}
                aria-current={position === index ? "true" : undefined}
                onClick={() => {
                  move((pos) => {
                    const delta = wrap(position - pos, size);
                    return pos + (delta * 2 > size ? delta - size : delta);
                  });
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
