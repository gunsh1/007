/**
 * 息（[C] で止める）。第2・6・7・10章で意味が変わる共通の動詞。
 *
 *   第 2章 観察 … 気配が消えて護衛に気づかれにくい
 *   第 6章 接近 … 足音が消える
 *   第 7章 配線 … 手の震えが止まる
 *   第10章 耐久 … 吐くタイミングを一拍こらえられる
 *
 * 止めている間だけ肺が減り、離すと戻る。空にすると大きく喘いで、
 * しばらく止められない（＝連続で頼れない）。
 */
export class Breath {
  /** 0..1。1 が満タン。 */
  air = 1;
  /** 息を止めている */
  held = false;
  /** 喘いでいる（この間は止められない） */
  gasping = false;
  /** 喘ぎの残り秒 */
  gaspT = 0;

  constructor(
    /** 止めている時の毎秒消費 */
    private drain = 0.42,
    /** 離している時の毎秒回復 */
    private recover = 0.30,
    /** 空にした時の喘ぎ時間 */
    private gaspTime = 1.5,
  ) {}

  /** want=true で止めようとする。実際に止まったかを返す。 */
  update(dt: number, want: boolean): boolean {
    if (this.gaspT > 0) {
      this.gaspT -= dt;
      this.held = false;
      this.air = Math.min(1, this.air + this.recover * 1.6 * dt);
      if (this.gaspT <= 0) this.gasping = false;
      return false;
    }

    this.held = want && this.air > 0;
    if (this.held) {
      this.air -= this.drain * dt;
      if (this.air <= 0) {
        this.air = 0;
        this.held = false;
        this.gasping = true;
        this.gaspT = this.gaspTime;
      }
    } else {
      this.air = Math.min(1, this.air + this.recover * dt);
    }
    return this.held;
  }

  reset(): void {
    this.air = 1;
    this.held = false;
    this.gasping = false;
    this.gaspT = 0;
  }
}
