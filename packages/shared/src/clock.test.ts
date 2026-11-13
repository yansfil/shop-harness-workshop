import { describe, expect, it } from "vitest";
import { FixedClock } from "./clock.ts";

describe("FixedClock", () => {
  it("advance로만 시간이 움직인다", () => {
    const clock = new FixedClock("2026-11-01T00:00:00.000Z");
    clock.advance(60_000);
    expect(clock.now().toISOString()).toBe("2026-11-01T00:01:00.000Z");
  });
});
