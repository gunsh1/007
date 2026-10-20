/**
 * AI プレイヤー。モンテカルロで勝率を見積もり、ポットオッズと性格から判断する。
 * ル・シッフルだけは専用の性格を持ち、ブラフかどうかを外に返す（癖システムが使う）。
 */
import type { Rng } from '../core/rng';
import { FULL_DECK, type Card } from './cards';
import { evaluate } from './evaluator';
import type { Action, HandEngine } from './betting';

export interface Profile {
  key: string;
  name: string;
  /** 高いほどベット・レイズを好む 0..1 */
  aggression: number;
  /** 弱いハンドで仕掛ける頻度 0..1 */
  bluffRate: number;
  /** 高いほど降りやすい（必要勝率の上乗せ） 0..0.6 */
  tightness: number;
  /** 高いほど降りずにコールする 0..1 */
  station: number;
  /** モンテカルロの試行数。強い相手ほど多く読む。 */
  iters: number;
}

export interface Decision {
  action: Action;
  /** 推定勝率 0..1 */
  equity: number;
  /** 弱い手で仕掛けたか（＝ブラフ） */
  bluff: boolean;
}

/** ル・シッフル。極端にタイトで、しかし要所で大きく踏み込む。 */
export const LE_CHIFFRE: Profile = {
  key: 'chiffre',
  name: 'ル・シッフル',
  aggression: 0.72,
  bluffRate: 0.30,
  tightness: 0.10,
  station: 0.20,
  iters: 420,
};

/** ボンド以外の8人。原作では背景の富豪・マフィアたち。 */
export const TABLE_PROFILES: Profile[] = [
  { key: 'infante', name: 'インファンテ', aggression: 0.30, bluffRate: 0.08, tightness: 0.34, station: 0.55, iters: 180 },
  { key: 'kaminofsky', name: 'カミノフスキー', aggression: 0.58, bluffRate: 0.26, tightness: 0.14, station: 0.25, iters: 220 },
  { key: 'tomelli', name: 'トメッリ', aggression: 0.44, bluffRate: 0.16, tightness: 0.22, station: 0.40, iters: 200 },
  { key: 'fukutu', name: 'フクトゥ', aggression: 0.22, bluffRate: 0.05, tightness: 0.42, station: 0.30, iters: 160 },
  { key: 'leiter', name: 'フィリックス・ライター', aggression: 0.50, bluffRate: 0.18, tightness: 0.20, station: 0.28, iters: 260 },
  { key: 'bliss', name: 'ブリス', aggression: 0.66, bluffRate: 0.34, tightness: 0.10, station: 0.18, iters: 200 },
  { key: 'gallardo', name: 'ガヤルド', aggression: 0.38, bluffRate: 0.12, tightness: 0.28, station: 0.48, iters: 180 },
  { key: 'packou', name: 'パッコウ', aggression: 0.48, bluffRate: 0.22, tightness: 0.18, station: 0.34, iters: 190 },
];

/**
 * モンテカルロによる勝率推定。
 * board が埋まっているほど正確。iters を増やすと精度と引き換えに重くなる。
 */
export function estimateEquity(
  hole: readonly Card[],
  board: readonly Card[],
  opponents: number,
  rng: Rng,
  iters: number,
): number {
  if (opponents <= 0) return 1;
  const known = new Set<Card>([...hole, ...board]);
  const pool: Card[] = FULL_DECK.filter((c) => !known.has(c));
  const boardNeeded = 5 - board.length;
  const need = opponents * 2 + boardNeeded;
  if (need > pool.length) return 0.5;

  let score = 0;
  const drawn: Card[] = new Array<Card>(need);
  const myCards: Card[] = new Array<Card>(7);
  const oppCards: Card[] = new Array<Card>(7);

  for (let it = 0; it < iters; it++) {
    // 部分 Fisher-Yates。必要な枚数だけ引く。
    for (let i = 0; i < need; i++) {
      const j = i + rng.int(pool.length - i);
      const t = pool[i]!; pool[i] = pool[j]!; pool[j] = t;
      drawn[i] = pool[i]!;
    }
    const runoutStart = opponents * 2;

    myCards[0] = hole[0]!; myCards[1] = hole[1]!;
    let k = 2;
    for (const b of board) myCards[k++] = b;
    for (let i = 0; i < boardNeeded; i++) myCards[k++] = drawn[runoutStart + i]!;
    const mine = evaluate(myCards);

    let best = -1;
    for (let o = 0; o < opponents; o++) {
      oppCards[0] = drawn[o * 2]!; oppCards[1] = drawn[o * 2 + 1]!;
      let m = 2;
      for (const b of board) oppCards[m++] = b;
      for (let i = 0; i < boardNeeded; i++) oppCards[m++] = drawn[runoutStart + i]!;
      const s = evaluate(oppCards);
      if (s > best) best = s;
    }
    if (mine > best) score += 1;
    else if (mine === best) score += 0.5;
  }
  return score / iters;
}

function snap(v: number, unit: number): number {
  return Math.max(unit, Math.round(v / unit) * unit);
}

/**
 * 意思決定。tilt は 0..1 で、上がるほど雑に攻撃的になる
 * （第4章のオバンノ襲撃後や、大きく負けた直後に上げる）。
 */
export function decide(e: HandEngine, seatIndex: number, p: Profile, rng: Rng, tilt = 0): Decision {
  const s = e.seats[seatIndex]!;
  const lg = e.legal();
  const opponents = Math.max(1, e.liveSeats().length - 1);

  const iters = Math.max(60, Math.round(p.iters * (e.board.length === 0 ? 0.6 : 1)));
  const eq = estimateEquity(s.hole, e.board, opponents, rng, iters);

  const aggression = Math.min(1, p.aggression + tilt * 0.35);
  const bluffRate = Math.min(0.8, p.bluffRate + tilt * 0.30);
  const tightness = Math.max(0, p.tightness - tilt * 0.10);

  const pot = e.pot;
  const call = lg.callAmount;
  const potOdds = call > 0 ? call / (pot + call) : 0;
  const threshold = potOdds * (1 + tightness) - p.station * 0.04;

  const bb = e.bigBlind;
  const shortStacked = s.chips < bb * 9;

  const raiseTo = (fracOfPot: number): number => {
    const want = lg.currentBet + Math.max(bb, Math.round(pot * fracOfPot));
    const to = Math.min(lg.maxRaiseTo, Math.max(lg.minRaiseTo, snap(want, bb)));
    return to;
  };

  // ショートスタックはプッシュ・オア・フォールド
  if (shortStacked && lg.raise) {
    if (eq > 0.46 + tightness * 0.2 || (eq > 0.34 && rng.chance(aggression * 0.5))) {
      return { action: { kind: 'allin' }, equity: eq, bluff: eq < 0.42 };
    }
  }

  // ── 誰もベットしていない ──
  if (lg.check) {
    const valueBet = eq > 0.60 - aggression * 0.12;
    const bluffBet = !valueBet && eq < 0.40 && rng.chance(bluffRate * (e.board.length === 0 ? 0.5 : 1));
    if ((valueBet || bluffBet) && lg.raise) {
      const frac = valueBet ? 0.45 + aggression * 0.45 : 0.5 + aggression * 0.25;
      return { action: { kind: 'raise', to: raiseTo(frac) }, equity: eq, bluff: bluffBet };
    }
    return { action: { kind: 'check' }, equity: eq, bluff: false };
  }

  // ── 誰かがベットしている ──
  const strong = eq >= threshold + 0.20;
  const playable = eq >= threshold;

  if (strong && lg.raise && rng.chance(0.35 + aggression * 0.5)) {
    const frac = 0.6 + aggression * 0.6;
    return { action: { kind: 'raise', to: raiseTo(frac) }, equity: eq, bluff: false };
  }

  // ブラフレイズ：弱いが、相手が弱そうに見える時
  if (!playable && lg.raise && eq < 0.34 && rng.chance(bluffRate * 0.45)) {
    return { action: { kind: 'raise', to: raiseTo(0.7 + aggression * 0.4) }, equity: eq, bluff: true };
  }

  if (playable && lg.call) return { action: { kind: 'call' }, equity: eq, bluff: false };

  // コールステーション気質：安ければ覗く
  if (lg.call && call <= bb * 2 && rng.chance(p.station * 0.55)) {
    return { action: { kind: 'call' }, equity: eq, bluff: false };
  }

  if (lg.check) return { action: { kind: 'check' }, equity: eq, bluff: false };
  return { action: { kind: 'fold' }, equity: eq, bluff: false };
}
