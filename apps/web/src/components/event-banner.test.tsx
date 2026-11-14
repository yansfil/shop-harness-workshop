import type { EventSummary } from "@grabmarket/contracts";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBanner } from "./event-banner.tsx";

const EVENTS: EventSummary[] = ["하나", "둘", "셋"].map((title, position) => ({
  slug: `event-${String(position + 1)}`,
  title,
  summary: `${title} 소개`,
  period: "11월 1일 ~ 11월 30일",
  bannerUrl: `/images/events/e${String(position + 1)}.webp`,
  productCount: 1,
}));

let reducedMotion = false;
let tabHidden = false;

function setTabHidden(hidden: boolean) {
  tabHidden = hidden;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  // Testing Library는 이 이름의 전역이 있어야 가짜 시계를 알아보고 비동기 도우미 안에서 시계를 같이 움직인다.
  vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime });
  reducedMotion = false;
  tabHidden = false;
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) => ({ matches: reducedMotion && query.includes("reduced-motion"), addEventListener: () => undefined, removeEventListener: () => undefined }) as unknown as MediaQueryList,
  );
  vi.spyOn(document, "hidden", "get").mockImplementation(() => tabHidden);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderBanner() {
  const view = render(
    <MemoryRouter>
      <EventBanner events={EVENTS} />
    </MemoryRouter>,
  );
  return { banner: screen.getByRole("region", { name: "기획전 배너" }), unmount: view.unmount };
}

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** 지금 읽히는(화면 밖이 아닌) 배너의 기획전 주소 */
function shownHref(banner: HTMLElement) {
  return within(banner).getByRole("link").getAttribute("href");
}

function track(banner: HTMLElement) {
  const element = banner.querySelector<HTMLElement>("[aria-live]");
  if (element === null) throw new Error("가로 트랙이 없습니다");
  return element;
}

describe("홈 배너 자동 넘김", () => {
  it("5초가 지나면 다음 기획전으로 넘어가고, 넘어가는 동안 가로 트랙이 0.5초 움직인다", () => {
    const { banner } = renderBanner();
    expect(shownHref(banner)).toBe("/events/event-1");

    wait(4999);
    expect(shownHref(banner)).toBe("/events/event-1");
    wait(1);
    expect(shownHref(banner)).toBe("/events/event-2");
    expect(track(banner).style.transform).toBe("translateX(-100%)");
    expect(track(banner).style.transitionDuration).toBe("500ms");
    expect(within(banner).getByRole("button", { name: "둘 배너 보기" })).toHaveAttribute("aria-current", "true");
  });

  it("미끄러지는 중에는 화면 밖 배너가 탭 순서와 읽기에서 빠지고, 끝나면 지나온 배너가 없어진다", () => {
    const { banner } = renderBanner();
    wait(5000);
    const slides = banner.querySelectorAll("a");
    expect(slides).toHaveLength(2);
    expect(slides[0]).toHaveAttribute("aria-hidden", "true");
    expect(slides[0]).toHaveAttribute("inert");
    expect(slides[1]).not.toHaveAttribute("aria-hidden");
    expect(slides[1]).not.toHaveAttribute("inert");

    wait(500);
    expect(banner.querySelectorAll("a")).toHaveLength(1);
  });

  it("마지막 다음은 같은 방향으로 첫 배너로 이어진다(트랙이 되감기지 않는다)", () => {
    const { banner } = renderBanner();
    wait(5000);
    wait(5000);
    expect(shownHref(banner)).toBe("/events/event-3");
    wait(5000);
    expect(shownHref(banner)).toBe("/events/event-1");
    expect(track(banner).style.transform).toBe("translateX(-300%)");
  });

  it("마우스를 올리면 멈추고 벗어나면 5초를 새로 세어 다시 간다", async () => {
    const user = userEvent.setup({ delay: null });
    const { banner } = renderBanner();
    await user.hover(banner);
    wait(20_000);
    expect(shownHref(banner)).toBe("/events/event-1");

    await user.unhover(banner);
    wait(4999);
    expect(shownHref(banner)).toBe("/events/event-1");
    wait(1);
    expect(shownHref(banner)).toBe("/events/event-2");
  });

  it("키보드 초점이 배너 안에 있으면 멈추고 밖으로 나가면 다시 간다", async () => {
    const user = userEvent.setup({ delay: null });
    const { banner } = renderBanner();
    await user.tab();
    expect(banner.contains(document.activeElement)).toBe(true);
    wait(20_000);
    expect(shownHref(banner)).toBe("/events/event-1");

    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    wait(5000);
    expect(shownHref(banner)).toBe("/events/event-2");
  });

  it("탭이 가려지면 멈추고 다시 보이면 5초를 새로 세어 다시 간다", () => {
    const { banner } = renderBanner();
    wait(3000);
    setTabHidden(true);
    wait(20_000);
    expect(shownHref(banner)).toBe("/events/event-1");

    setTabHidden(false);
    wait(4999);
    expect(shownHref(banner)).toBe("/events/event-1");
    wait(1);
    expect(shownHref(banner)).toBe("/events/event-2");
  });

  it("일시정지 버튼은 멈추고 접근 이름이 바뀌며, 재생 버튼을 누르면 다시 간다", async () => {
    const user = userEvent.setup({ delay: null });
    const { banner } = renderBanner();
    await user.click(within(banner).getByRole("button", { name: "자동 넘김 멈추기" }));
    await user.unhover(banner);
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    wait(20_000);
    expect(shownHref(banner)).toBe("/events/event-1");

    await user.click(within(banner).getByRole("button", { name: "자동 넘김 켜기" }));
    await user.unhover(banner);
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    wait(5000);
    expect(shownHref(banner)).toBe("/events/event-2");
    expect(within(banner).getByRole("button", { name: "자동 넘김 멈추기" })).toBeInTheDocument();
  });

  it("버튼과 점으로 넘기면 그 배너로 가고 5초를 새로 센다", async () => {
    const user = userEvent.setup({ delay: null });
    const { banner } = renderBanner();
    wait(4000);
    await user.click(within(banner).getByRole("button", { name: "다음 기획전" }));
    expect(shownHref(banner)).toBe("/events/event-2");
    await user.unhover(banner);
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    wait(4999);
    expect(shownHref(banner)).toBe("/events/event-2");
    wait(1);
    expect(shownHref(banner)).toBe("/events/event-3");

    wait(2500);
    await user.click(within(banner).getByRole("button", { name: "하나 배너 보기" }));
    expect(shownHref(banner)).toBe("/events/event-1");
    await user.unhover(banner);
    act(() => {
      (document.activeElement as HTMLElement).blur();
    });
    wait(4999);
    expect(shownHref(banner)).toBe("/events/event-1");
    wait(1);
    expect(shownHref(banner)).toBe("/events/event-2");
  });

  it("동작 줄이기를 켜면 자동으로 넘어가지 않고 미끄러짐 없이 바로 바뀌며 일시정지 버튼이 없다", async () => {
    reducedMotion = true;
    const user = userEvent.setup({ delay: null });
    const { banner } = renderBanner();
    wait(30_000);
    expect(shownHref(banner)).toBe("/events/event-1");
    expect(within(banner).queryByRole("button", { name: /자동 넘김/ })).not.toBeInTheDocument();
    expect(track(banner).style.transitionDuration).toBe("0ms");

    await user.click(within(banner).getByRole("button", { name: "다음 기획전" }));
    expect(shownHref(banner)).toBe("/events/event-2");
  });

  it("사라질 때 남은 타이머가 없다", async () => {
    const user = userEvent.setup({ delay: null });
    const { banner, unmount } = renderBanner();
    await user.click(within(banner).getByRole("button", { name: "다음 기획전" }));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("멈췄다 풀 때마다 타이머를 새로 하나만 둔다(쌓이지 않는다)", async () => {
    const user = userEvent.setup({ delay: null });
    const { banner } = renderBanner();
    wait(500);
    expect(vi.getTimerCount()).toBe(1);
    await user.hover(banner);
    expect(vi.getTimerCount()).toBe(0);
    for (let round = 0; round < 3; round += 1) {
      await user.unhover(banner);
      await user.hover(banner);
    }
    await user.unhover(banner);
    expect(vi.getTimerCount()).toBe(1);
  });
});
