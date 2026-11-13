import type { Clock } from "@grabmarket/shared";

/** 시드가 과거 시각으로 주문을 만들 때 쓰는 시계. set으로만 움직인다. */
export class SeedClock implements Clock {
  #at: Date;

  constructor(at: Date) {
    this.#at = at;
  }

  now(): Date {
    return this.#at;
  }

  set(at: Date): void {
    this.#at = at;
  }
}
