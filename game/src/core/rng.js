// シード指定可能な乱数（テストで戦闘を再現するため）。mulberry32。

export class Rng {
  /** @param {number} [seed] */
  constructor(seed = Date.now() >>> 0) {
    this.state = seed >>> 0;
  }

  /** [0,1) */
  next() {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @param {number} lo @param {number} hi */
  range(lo, hi) {
    return lo + (hi - lo) * this.next();
  }

  /** @param {number} p 0～1 */
  chance(p) {
    return this.next() < p;
  }

  /**
   * @template T
   * @param {T[]} arr
   * @returns {T}
   */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * @template T
   * @param {T[]} items
   * @param {(t: T) => number} weightOf
   * @returns {T}
   */
  weighted(items, weightOf) {
    const total = items.reduce((s, it) => s + Math.max(0, weightOf(it)), 0);
    if (total <= 0) return this.pick(items);
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weightOf(it));
      if (r < 0) return it;
    }
    return items[items.length - 1];
  }
}
