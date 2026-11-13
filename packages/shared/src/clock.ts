// 시간은 Clock을 주입받아서만 읽는다. `new Date()`를 직접 부르는 곳은 systemClock 한 곳뿐이다.
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** 테스트·시드용 고정 시계. advance로만 움직인다. */
export class FixedClock implements Clock {
  #epochMs: number;

  constructor(at: Date | string) {
    const epochMs = new Date(at).getTime();
    if (Number.isNaN(epochMs)) throw new RangeError(`올바른 시각이 아닙니다: ${String(at)}`);
    this.#epochMs = epochMs;
  }

  now(): Date {
    return new Date(this.#epochMs);
  }

  advance(ms: number): void {
    this.#epochMs += ms;
  }
}
