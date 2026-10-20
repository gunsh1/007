/**
 * ハンド評価。5枚／7枚から「強さの整数スコア」を返す純関数。
 * 高いほど強い。異なるカテゴリ同士も同じ尺度で比較できる。
 *
 * 役の番号は原作の数え方（9種）に合わせてある：
 *   1 ストレートフラッシュ（ロイヤル含む） / 2 フォーカード / 3 フルハウス /
 *   4 フラッシュ / 5 ストレート / 6 スリーカード / 7 ツーペア / 8 ワンペア / 9 ハイカード
 * 第5章の「9つある役のうち3番目に強いフルハウス」がそのまま成り立つ。
 */
import { rankOf, suitOf, type Card } from './cards';

export const Cat = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;
export type Cat = (typeof Cat)[keyof typeof Cat];

/** 原作準拠の「上から何番目に強い役か」(1..9) */
export function handRankNumber(score: number): number {
  return 9 - categoryOf(score);
}

const BASE = 15;
const MULT = BASE ** 5; // 759375

function mk(cat: Cat, ranks: readonly number[]): number {
  let v = 0;
  for (let i = 0; i < 5; i++) v = v * BASE + (ranks[i] ?? 0) + 1;
  return cat * MULT + v;
}

export function categoryOf(score: number): Cat {
  return Math.floor(score / MULT) as Cat;
}

const CAT_NAMES_JP: readonly string[] = [
  'ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート',
  'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ',
];

export function handName(score: number): string {
  const cat = categoryOf(score);
  if (cat === Cat.StraightFlush) {
    // 最上位が A ならロイヤル
    const top = Math.floor((score % MULT) / BASE ** 4) - 1;
    if (top === 12) return 'ロイヤルストレートフラッシュ';
  }
  return CAT_NAMES_JP[cat] ?? '?';
}

/**
 * 14ビットのランクマスクから最も高いストレートのトップランクを返す。無ければ -1。
 * A-2-3-4-5（ホイール）に対応するため A を下端にも置く。
 */
function straightHigh(mask: number): number {
  const m = ((mask << 1) | ((mask >> 12) & 1)) & 0x3fff;
  for (let hi = 13; hi >= 4; hi--) {
    const need = 0b11111 << (hi - 4);
    if ((m & need) === need) return hi - 1;
  }
  return -1;
}

/** マスクから上位 n ランクを降順で */
function topRanks(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

/** 5〜7枚を評価する。7枚が最速経路。 */
export function evaluate(cards: readonly Card[]): number {
  const rankCount = new Int8Array(13);
  const suitCount = new Int8Array(4);
  const suitMask = new Int16Array(4);
  let rankMask = 0;

  for (const c of cards) {
    const r = rankOf(c);
    const s = suitOf(c);
    rankCount[r]!++;
    suitCount[s]!++;
    suitMask[s]! |= 1 << r;
    rankMask |= 1 << r;
  }

  // ── フラッシュ系 ──
  // 7枚以下ではフラッシュとフルハウス／フォーカードは同時に成立しないため、先に判定してよい。
  for (let s = 0; s < 4; s++) {
    if (suitCount[s]! < 5) continue;
    const fm = suitMask[s]!;
    const sf = straightHigh(fm);
    if (sf >= 0) return mk(Cat.StraightFlush, [sf]);
    return mk(Cat.Flush, topRanks(fm, 5));
  }

  // ── 同ランクの組み合わせ ──
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    const n = rankCount[r]!;
    if (n === 4) quads.push(r);
    else if (n === 3) trips.push(r);
    else if (n === 2) pairs.push(r);
  }

  if (quads.length > 0) {
    const q = quads[0]!;
    const kick = topRanks(rankMask & ~(1 << q), 1);
    return mk(Cat.Quads, [q, kick[0] ?? 0]);
  }

  if (trips.length >= 2) {
    return mk(Cat.FullHouse, [trips[0]!, trips[1]!]);
  }
  if (trips.length === 1 && pairs.length >= 1) {
    return mk(Cat.FullHouse, [trips[0]!, pairs[0]!]);
  }

  const st = straightHigh(rankMask);
  if (st >= 0) return mk(Cat.Straight, [st]);

  if (trips.length === 1) {
    const t = trips[0]!;
    return mk(Cat.Trips, [t, ...topRanks(rankMask & ~(1 << t), 2)]);
  }
  if (pairs.length >= 2) {
    const [p1, p2] = [pairs[0]!, pairs[1]!];
    const kick = topRanks(rankMask & ~(1 << p1) & ~(1 << p2), 1);
    return mk(Cat.TwoPair, [p1, p2, kick[0] ?? 0]);
  }
  if (pairs.length === 1) {
    const p = pairs[0]!;
    return mk(Cat.Pair, [p, ...topRanks(rankMask & ~(1 << p), 3)]);
  }
  return mk(Cat.HighCard, topRanks(rankMask, 5));
}

/** 7枚から役を作る最良の5枚を返す（ショーダウン表示用） */
export function bestFive(cards: readonly Card[]): Card[] {
  if (cards.length <= 5) return [...cards];
  let best = -1;
  let bestSet: Card[] = [];
  const n = cards.length;
  const idx = [0, 1, 2, 3, 4];
  // C(n,5) の全列挙
  const rec = (start: number, depth: number): void => {
    if (depth === 5) {
      const hand = idx.map((i) => cards[i]!);
      const s = evaluate(hand);
      if (s > best) { best = s; bestSet = hand; }
      return;
    }
    for (let i = start; i < n; i++) {
      idx[depth] = i;
      rec(i + 1, depth + 1);
    }
  };
  rec(0, 0);
  return bestSet;
}

/** 総当たりで最良5枚のスコアを求める（evaluate の検証用の遅い実装） */
export function evaluateBruteForce(cards: readonly Card[]): number {
  if (cards.length <= 5) return evaluate(cards);
  let best = -1;
  const n = cards.length;
  const idx = [0, 0, 0, 0, 0];
  const rec = (start: number, depth: number): void => {
    if (depth === 5) {
      const s = evaluate(idx.map((i) => cards[i]!));
      if (s > best) best = s;
      return;
    }
    for (let i = start; i < n; i++) {
      idx[depth] = i;
      rec(i + 1, depth + 1);
    }
  };
  rec(0, 0);
  return best;
}
