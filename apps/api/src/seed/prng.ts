/** 시드 고정 의사 난수(mulberry32). 시드와 시뮬레이터의 랜덤은 모두 여기서만 나온다. */
export class Prng {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** min 이상 max 이하의 정수 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) throw new RangeError("빈 목록에서 고를 수 없습니다");
    return item;
  }

  /** weights 비율대로 인덱스를 고른다. */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let point = this.next() * total;
    for (const [index, weight] of weights.entries()) {
      point -= weight;
      if (point < 0) return index;
    }
    return weights.length - 1;
  }
}
