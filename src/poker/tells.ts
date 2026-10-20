/**
 * 癖（TELL）システム。本作の心臓。
 *
 * 原作 L.71: ル・シッフルはブラフの時、顔がひきつり左のこめかみに手を当てる。
 * 原作 L.85: 第5章ではそれを見抜かれていると察していて、意図的に偽の癖を出す。
 *
 * ここでは「本物の癖 / 偽の癖 / 出さない」の3状態を持ち、章ごとの設定で
 * 発火率を変える。プレイヤーは観察キーを長押ししている間だけ読み取れる。
 */
import type { Rng } from '../core/rng';
import type { Decision } from './opponents';

export type TellKind = 'none' | 'genuine' | 'fake';

export interface TellConfig {
  /** ブラフの時に本物の癖を出す確率 */
  showOnBluff: number;
  /** 強い手の時に偽の癖を出す確率（第5章で跳ね上がる） */
  fakeOnValue: number;
  /** 癖が見えている時間（秒） */
  duration: number;
}

export const TELL_PRESETS: Record<'ch03' | 'ch05' | 'ch08', TellConfig> = {
  // 第一夜：素直に出る。ここでプレイヤーに癖を覚えさせる。
  ch03: { showOnBluff: 1.0, fakeOnValue: 0.05, duration: 1.4 },
  // 第5章：読まれていると察している。偽の癖でボンドを罠にかける。
  ch05: { showOnBluff: 0.35, fakeOnValue: 0.85, duration: 1.25 },
  // 最終ハンド：癖はほとんど出ない。本気のル・シッフル。
  ch08: { showOnBluff: 0.30, fakeOnValue: 0.40, duration: 1.0 },
};

export interface TellReadout {
  /** 表示する見立て */
  text: string;
  /** 0..100 */
  confidence: number;
  /** 高い読みの持ち主だけが気づく違和感（偽の癖のとき） */
  suspicious: boolean;
}

export class Tells {
  kind: TellKind = 'none';
  /** 癖が出てからの経過秒 */
  t = 0;
  /** プレイヤーがこの癖を観察できたか */
  observed = false;
  /** 直前の決定がブラフだったか（判定の答え合わせ用） */
  wasBluff = false;

  constructor(public cfg: TellConfig) {}

  /**
   * ル・シッフルが行動を決めた瞬間に呼ぶ。
   *
   * 配り札は完全ランダムなので、癖は「実際にブラフだったか」だけを見て出す。
   * readLevel（ボンドの読み 0..100）が高いほど、見られていると察した彼は
   * 本物の癖を抑え、偽の癖を増やす。第5章の罠は仕込みではなく、この反応の結果。
   */
  begin(d: Decision, rng: Rng, readLevel = 0): TellKind {
    this.t = 0;
    this.observed = false;
    this.wasBluff = d.bluff;

    const aggressive = d.action.kind === 'raise' || d.action.kind === 'allin';
    if (!aggressive) { this.kind = 'none'; return this.kind; }

    const read = Math.max(0, Math.min(100, readLevel)) / 100;
    // 読まれるほど本物は漏らさなくなり、偽物は増える
    const genuineRate = this.cfg.showOnBluff * (1 - read * 0.45);
    const fakeRate = this.cfg.fakeOnValue * (0.35 + read * 0.65);

    if (d.bluff) {
      this.kind = rng.chance(genuineRate) ? 'genuine' : 'none';
    } else if (d.equity > 0.58) {
      this.kind = rng.chance(fakeRate) ? 'fake' : 'none';
    } else {
      this.kind = 'none';
    }
    return this.kind;
  }

  clear(): void { this.kind = 'none'; this.t = 0; this.observed = false; }

  update(dt: number, observing: boolean): void {
    if (this.kind === 'none') return;
    this.t += dt;
    if (observing && this.t < this.cfg.duration) this.observed = true;
    if (this.t > this.cfg.duration) this.kind = 'none';
  }

  get visible(): boolean { return this.kind !== 'none' && this.t <= this.cfg.duration; }

  /**
   * 観察中に表示する読み。
   * 偽の癖でも見立ては「ブラフ」になる — そこが第5章の罠。
   * ただし tellRead が高いと「わざとらしさ」に気づく。
   */
  readout(tellRead: number): TellReadout {
    if (!this.visible) {
      return { text: '読み取れない', confidence: Math.max(0, 20 - tellRead * 0.1), suspicious: false };
    }
    const confidence = Math.min(96, 52 + tellRead * 0.44);
    return {
      text: 'ブラフ',
      confidence,
      suspicious: this.kind === 'fake' && tellRead >= 70,
    };
  }

  /**
   * 観察の成果。癖を実際に見られたら読みが上がる。
   * 戻り値は tellRead の増分。
   */
  reward(): number {
    if (!this.observed) return 0;
    return this.kind === 'genuine' ? 6 : 2;
  }

  /**
   * ショーダウンで答え合わせができたぶんの学習。
   * 手が割れれば、観察していた癖が本物だったか偽物だったかを事後に確認できる。
   */
  static showdownGain(kind: TellKind, observed: boolean): number {
    if (!observed || kind === 'none') return 0;
    // 偽物を掴まされた経験のほうが、次から効く
    return kind === 'fake' ? 5 : 3;
  }
}

/**
 * ボンド自身の癖。レイズ確定までにかけた時間のばらつきを AI が学習する。
 * 溜めてから大きく行くクセがつくほど tellLeak が上がり、
 * 終盤ル・シッフルに読み返される。
 */
export class HeroTellTracker {
  private samples: { hesitation: number; aggressive: boolean }[] = [];

  record(hesitationSeconds: number, aggressive: boolean): void {
    this.samples.push({ hesitation: hesitationSeconds, aggressive });
    if (this.samples.length > 24) this.samples.shift();
  }

  /**
   * 0..100。攻撃時と非攻撃時で「考える時間」がはっきり分かれているほど高い。
   */
  leak(): number {
    const agg = this.samples.filter((s) => s.aggressive);
    const pas = this.samples.filter((s) => !s.aggressive);
    if (agg.length < 3 || pas.length < 3) return 0;
    const mean = (a: typeof agg): number => a.reduce((n, s) => n + s.hesitation, 0) / a.length;
    const gap = Math.abs(mean(agg) - mean(pas));
    return Math.min(100, Math.round(gap * 45));
  }

  reset(): void { this.samples = []; }
}
