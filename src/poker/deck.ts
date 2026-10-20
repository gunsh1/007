import { Rng } from '../core/rng';
import { FULL_DECK, type Card } from './cards';

/**
 * デッキ。シード付きの完全ランダム。
 * ゲーム中はどの章でも配り札を仕込まない（TableScene が毎回新しい種を引く）。
 *
 * arrange() は検証用に残してある。特定の局面を作って
 * 評価器やサイドポットを確かめる時にだけ使う。
 *
 * 配る順序は「席ごとに2枚まとめて」→「フロップ3・ターン1・リバー1」。
 * シャッフル済みデッキでは1枚ずつ回し配りと確率的に等価。
 */
export class Deck {
  private cards: Card[] = [];
  private pos = 0;

  constructor(private rng: Rng) { this.reset(); }

  reset(): void {
    this.cards = this.rng.shuffle([...FULL_DECK]);
    this.pos = 0;
  }

  get remaining(): number { return this.cards.length - this.pos; }

  deal(): Card {
    if (this.pos >= this.cards.length) throw new Error('deck exhausted');
    return this.cards[this.pos++]!;
  }

  dealMany(n: number): Card[] {
    const out: Card[] = [];
    for (let i = 0; i < n; i++) out.push(this.deal());
    return out;
  }

  /** 残りのカード（ AI の推定でデッドカードを除くのに使う ） */
  rest(): Card[] { return this.cards.slice(this.pos); }

  /**
   * 仕込み。seats 人ぶんのホールカードとボードを指定する。
   * null / undefined のところはランダムのまま。
   *
   *   arrange(10, { holes: { 0: [As,Ad], 3: [Kc,Kh] }, board: [.., .., ..] })
   */
  arrange(seats: number, spec: { holes?: Record<number, readonly Card[]>; board?: readonly Card[] }): void {
    this.reset();
    const size = seats * 2 + 5;
    const slots: (Card | null)[] = Array<Card | null>(size).fill(null);
    const used = new Set<Card>();

    const place = (index: number, card: Card): void => {
      if (used.has(card)) throw new Error(`duplicate scripted card: ${card}`);
      used.add(card);
      slots[index] = card;
    };

    if (spec.holes) {
      for (const [k, cs] of Object.entries(spec.holes)) {
        const seat = Number(k);
        if (seat < 0 || seat >= seats) throw new Error(`scripted seat out of range: ${seat}`);
        cs.forEach((c, i) => { if (i < 2) place(seat * 2 + i, c); });
      }
    }
    if (spec.board) {
      spec.board.forEach((c, i) => { if (i < 5) place(seats * 2 + i, c); });
    }

    // 残りは、仕込みで使ったカードを除いたシャッフル済みの列で埋める
    const pool = this.cards.filter((c) => !used.has(c));
    let p = 0;
    for (let i = 0; i < size; i++) if (slots[i] === null) slots[i] = pool[p++]!;

    this.cards = [...(slots as Card[]), ...pool.slice(p)];
    this.pos = 0;
  }
}

/** ハンド番号などから毎回同じ配りを再現するためのシード生成 */
export function handSeed(base: number, handNumber: number): number {
  return (base ^ (handNumber * 0x9e37_79b9)) >>> 0;
}

export function makeDeck(seed: number): Deck { return new Deck(new Rng(seed)); }
