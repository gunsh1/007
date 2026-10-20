/**
 * シード付き乱数。ポーカーのハンドを後から再現・検証できるようにするため、
 * Math.random() は使わない。
 */
export class Rng {
  private s: number;

  constructor(seed: number = 0x5eed_1007) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e37_79b9;
  }

  /** mulberry32 */
  next(): number {
    this.s = (this.s + 0x6d2b_79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [0, n) の整数 */
  int(n: number): number { return Math.floor(this.next() * n); }
  /** [lo, hi] の整数 */
  range(lo: number, hi: number): number { return lo + this.int(hi - lo + 1); }
  /** [lo, hi) の実数 */
  float(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
  chance(p: number): boolean { return this.next() < p; }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[this.int(arr.length)]!;
  }

  /** Fisher-Yates（破壊的） */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
    return arr;
  }

  /** 現在の内部状態（セーブ・再現用） */
  get state(): number { return this.s; }
  set state(v: number) { this.s = v >>> 0; }

  fork(): Rng { return new Rng(this.s ^ 0x9e37_79b9); }
}

/** 演出用のグローバル乱数。ゲーム進行の判定には使わないこと。 */
export const fxRng = new Rng(0xbe11_a007);
