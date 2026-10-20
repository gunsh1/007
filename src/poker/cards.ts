/**
 * カードは 0..51 の整数。 rank * 4 + suit。
 *   rank: 0=2, 1=3, ... 8=T, 9=J, 10=Q, 11=K, 12=A
 *   suit: 0=♣ 1=♦ 2=♥ 3=♠
 * ブラウザにも Node のテストにも同じものを使うため、DOM に依存しない。
 */
export type Card = number;

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = 'cdhs';
export const SUIT_GLYPHS = ['♣', '♦', '♥', '♠'] as const;
export const RANK_JP = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export const NUM_CARDS = 52;

export function makeCard(rank: number, suit: number): Card { return rank * 4 + suit; }
export function rankOf(c: Card): number { return c >> 2; }
export function suitOf(c: Card): number { return c & 3; }
/** 赤いスート（♦♥）か */
export function isRed(c: Card): boolean { const s = suitOf(c); return s === 1 || s === 2; }

/** 'As' 'Th' '2c' 形式 */
export function cardStr(c: Card): string {
  return RANK_CHARS[rankOf(c)]! + SUIT_CHARS[suitOf(c)]!;
}

/** 表示用 'A♠' */
export function cardGlyph(c: Card): string {
  return RANK_JP[rankOf(c)]! + SUIT_GLYPHS[suitOf(c)]!;
}

export function parseCard(s: string): Card {
  const r = RANK_CHARS.indexOf(s[0]!.toUpperCase());
  const su = SUIT_CHARS.indexOf(s[1]!.toLowerCase());
  if (r < 0 || su < 0) throw new Error(`bad card: ${s}`);
  return makeCard(r, su);
}

/** 'AsKd' や 'As Kd 7c' をまとめて */
export function parseCards(s: string): Card[] {
  const t = s.replace(/[\s,]/g, '');
  const out: Card[] = [];
  for (let i = 0; i + 1 < t.length; i += 2) out.push(parseCard(t.slice(i, i + 2)));
  return out;
}

export function cardsStr(cs: readonly Card[]): string {
  return cs.map(cardStr).join(' ');
}

export const FULL_DECK: readonly Card[] = Array.from({ length: NUM_CARDS }, (_, i) => i);
