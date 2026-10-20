/**
 * ノーリミット・テキサスホールデムの進行エンジン。
 * ブラインド、アクション順、ミニマムレイズ、ショートオールイン（リオープンしない）、
 * サイドポットまで実装している。描画も入力も知らない純粋なロジック。
 */
import type { Card } from './cards';
import { cardsStr } from './cards';
import { bestFive, evaluate, handName } from './evaluator';
import type { Deck } from './deck';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'complete';
export type ActionKind = 'fold' | 'check' | 'call' | 'raise' | 'allin';

/** raise の to は「このラウンドの累計をいくらにするか」 */
export interface Action { kind: ActionKind; to?: number }

export interface Seat {
  id: number;
  name: string;
  /** 手元のスタック（まだ場に出していない分） */
  chips: number;
  /** 現ラウンドで場に出した額 */
  bet: number;
  /** このハンドで場に出した累計 */
  committed: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  /** バスト（テーブルから退場） */
  out: boolean;
  /** このラウンドでまだアクションが必要か */
  needsToAct: boolean;
  /** ボンドか */
  hero: boolean;
}

export interface Legal {
  fold: boolean;
  check: boolean;
  call: boolean;
  /** コールに必要な支払額（差額） */
  callAmount: number;
  raise: boolean;
  /** レイズ後のラウンド累計の下限・上限 */
  minRaiseTo: number;
  maxRaiseTo: number;
  /** 現在の最高ベット */
  currentBet: number;
}

export interface PotResult {
  amount: number;
  winners: number[];
  score: number;
}

export interface Showdown {
  seatId: number;
  score: number;
  name: string;
  best: Card[];
}

export interface HandResult {
  pots: PotResult[];
  /** seatId → 獲得額 */
  payouts: Record<number, number>;
  showdowns: Showdown[];
  /** ショーダウンなしで終わったか */
  walkover: boolean;
}

export interface EngineOpts {
  seats: { id: number; name: string; chips: number; hero?: boolean }[];
  button: number;
  smallBlind: number;
  bigBlind: number;
  /** 参加費を払っていない（バストした）席は out=true で渡す */
}

export function makeSeats(defs: EngineOpts['seats']): Seat[] {
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    chips: d.chips,
    bet: 0,
    committed: 0,
    hole: [],
    folded: false,
    allIn: false,
    out: d.chips <= 0,
    needsToAct: false,
    hero: d.hero === true,
  }));
}

export class HandEngine {
  seats: Seat[];
  board: Card[] = [];
  street: Street = 'preflop';
  button: number;
  smallBlind: number;
  bigBlind: number;

  currentBet = 0;
  /** 直近の「フルレイズ」の上げ幅。ミニマムレイズの基準。 */
  lastRaiseSize = 0;
  /** 手番の席インデックス。-1 なら手番なし。 */
  actor = -1;
  result: HandResult | null = null;
  log: string[] = [];

  constructor(seats: Seat[], opts: { button: number; smallBlind: number; bigBlind: number }, private deck: Deck) {
    this.seats = seats;
    this.button = opts.button;
    this.smallBlind = opts.smallBlind;
    this.bigBlind = opts.bigBlind;
  }

  // ── 参照系 ────────────────────────────────────────────────────

  get pot(): number { return this.seats.reduce((n, s) => n + s.committed, 0); }
  get isComplete(): boolean { return this.street === 'complete'; }
  get actorSeat(): Seat | null { return this.actor >= 0 ? this.seats[this.actor]! : null; }

  /** ハンドに残っている（降りていない）席 */
  liveSeats(): Seat[] { return this.seats.filter((s) => !s.out && !s.folded); }
  /** まだアクションできる席（オールインを除く） */
  actableSeats(): Seat[] { return this.liveSeats().filter((s) => !s.allIn && s.chips > 0); }

  private next(from: number, pred: (s: Seat) => boolean): number {
    const n = this.seats.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (pred(this.seats[idx]!)) return idx;
    }
    return -1;
  }

  private inHand = (s: Seat): boolean => !s.out && !s.folded;
  private canAct = (s: Seat): boolean => this.inHand(s) && !s.allIn && s.chips > 0;

  // ── 開始 ─────────────────────────────────────────────────────

  begin(): void {
    for (const s of this.seats) {
      s.bet = 0;
      s.committed = 0;
      s.hole = [];
      s.folded = s.out;
      s.allIn = false;
      s.needsToAct = false;
    }
    this.board = [];
    this.street = 'preflop';
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.result = null;
    this.log = [];

    const players = this.seats.filter((s) => !s.out);
    if (players.length < 2) { this.street = 'complete'; return; }

    // ホールカードを席順に2枚ずつ（Deck.arrange の並びと一致させる）
    for (const s of this.seats) {
      if (s.out) { this.deck.dealMany(2); continue; }
      s.hole = this.deck.dealMany(2);
    }

    // ブラインド。ヘッズアップではボタンが SB。
    const heads = players.length === 2;
    const sbIdx = heads ? this.button : this.next(this.button, (s) => !s.out);
    const bbIdx = this.next(sbIdx, (s) => !s.out);

    this.postBlind(sbIdx, this.smallBlind, 'SB');
    this.postBlind(bbIdx, this.bigBlind, 'BB');
    this.currentBet = this.bigBlind;

    for (const s of this.seats) s.needsToAct = this.canAct(s);

    this.actor = this.next(bbIdx, this.canAct);
    if (this.actor < 0 || this.actableSeats().length <= 1) this.finishBettingRound();
  }

  private postBlind(idx: number, amount: number, label: string): void {
    const s = this.seats[idx]!;
    const pay = Math.min(amount, s.chips);
    s.chips -= pay;
    s.bet += pay;
    s.committed += pay;
    if (s.chips === 0) s.allIn = true;
    this.log.push(`${s.name} ${label} ${pay}`);
  }

  // ── アクション ────────────────────────────────────────────────

  legal(): Legal {
    const s = this.actorSeat;
    if (!s) {
      return { fold: false, check: false, call: false, callAmount: 0, raise: false, minRaiseTo: 0, maxRaiseTo: 0, currentBet: this.currentBet };
    }
    const callAmount = Math.min(this.currentBet - s.bet, s.chips);
    const maxRaiseTo = s.bet + s.chips;
    const wantMin = this.currentBet + this.lastRaiseSize;
    const minRaiseTo = Math.min(wantMin, maxRaiseTo);
    return {
      fold: true,
      check: this.currentBet - s.bet <= 0,
      call: callAmount > 0,
      callAmount,
      raise: maxRaiseTo > this.currentBet,
      minRaiseTo,
      maxRaiseTo,
      currentBet: this.currentBet,
    };
  }

  act(a: Action): void {
    const idx = this.actor;
    const s = this.seats[idx];
    if (!s) throw new Error('no actor');
    const lg = this.legal();

    switch (a.kind) {
      case 'fold': {
        s.folded = true;
        this.log.push(`${s.name} フォールド`);
        break;
      }
      case 'check': {
        if (!lg.check) throw new Error(`${s.name} cannot check`);
        this.log.push(`${s.name} チェック`);
        break;
      }
      case 'call': {
        const pay = lg.callAmount;
        this.pay(s, pay);
        this.log.push(`${s.name} コール ${pay}`);
        break;
      }
      case 'raise':
      case 'allin': {
        let to = a.kind === 'allin' ? lg.maxRaiseTo : (a.to ?? lg.minRaiseTo);
        to = Math.max(to, Math.min(lg.minRaiseTo, lg.maxRaiseTo));
        to = Math.min(to, lg.maxRaiseTo);
        if (to <= this.currentBet) {
          // レイズできる額がない → 実質コール（ショートオールイン）
          const pay = Math.min(s.chips, this.currentBet - s.bet);
          this.pay(s, pay);
          this.log.push(`${s.name} オールイン ${s.bet}`);
          break;
        }
        const raiseSize = to - this.currentBet;
        this.pay(s, to - s.bet);
        const full = raiseSize >= this.lastRaiseSize;
        if (full) {
          this.lastRaiseSize = raiseSize;
          // フルレイズはベッティングを再開させる
          for (const o of this.seats) if (o !== s && this.canAct(o)) o.needsToAct = true;
        }
        this.currentBet = to;
        this.log.push(`${s.name} ${a.kind === 'allin' || s.allIn ? 'オールイン' : 'レイズ'} ${to}${full ? '' : '(ショート)'}`);
        break;
      }
    }

    s.needsToAct = false;

    // 残り1人ならその場で終了
    if (this.liveSeats().length <= 1) { this.settle(true); return; }

    const nxt = this.next(idx, (o) => this.canAct(o) && o.needsToAct);
    if (nxt >= 0) { this.actor = nxt; return; }
    this.finishBettingRound();
  }

  private pay(s: Seat, amount: number): void {
    const pay = Math.max(0, Math.min(amount, s.chips));
    s.chips -= pay;
    s.bet += pay;
    s.committed += pay;
    if (s.chips === 0) s.allIn = true;
  }

  // ── ストリート進行 ────────────────────────────────────────────

  private finishBettingRound(): void {
    for (const s of this.seats) { s.bet = 0; s.needsToAct = false; }
    this.currentBet = 0;
    this.lastRaiseSize = this.bigBlind;
    this.actor = -1;

    if (this.street === 'river') { this.settle(false); return; }

    const dealNext = (): void => {
      if (this.street === 'preflop') { this.board.push(...this.deck.dealMany(3)); this.street = 'flop'; }
      else if (this.street === 'flop') { this.board.push(this.deck.deal()); this.street = 'turn'; }
      else if (this.street === 'turn') { this.board.push(this.deck.deal()); this.street = 'river'; }
    };

    dealNext();

    // アクションできる人が1人以下 → 残りのボードを一気に開いてショーダウン
    if (this.actableSeats().length <= 1) {
      while (this.board.length < 5) {
        this.board.push(this.deck.deal());
        this.street = this.board.length === 4 ? 'turn' : 'river';
      }
      this.settle(false);
      return;
    }

    for (const s of this.seats) s.needsToAct = this.canAct(s);
    this.actor = this.next(this.button, this.canAct);
  }

  // ── 精算 ─────────────────────────────────────────────────────

  /** サイドポットを積み上げる。降りた人の拠出もポットには入るが、権利は持たない。 */
  buildPots(): { amount: number; eligible: number[] }[] {
    const levels = [...new Set(this.seats.filter((s) => s.committed > 0).map((s) => s.committed))].sort((a, b) => a - b);
    const pots: { amount: number; eligible: number[] }[] = [];
    let prev = 0;
    for (const lv of levels) {
      let amount = 0;
      for (const s of this.seats) amount += Math.min(s.committed, lv) - Math.min(s.committed, prev);
      const eligible = this.seats.filter((s) => !s.folded && !s.out && s.committed >= lv).map((s) => s.id);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lv;
    }
    return pots;
  }

  private settle(walkover: boolean): void {
    this.street = 'showdown';
    // 途中で全員降りた場合もここを通るので、ラウンド状態をここで畳む
    for (const s of this.seats) { s.bet = 0; s.needsToAct = false; }
    this.currentBet = 0;
    const byId = new Map(this.seats.map((s) => [s.id, s]));
    const scores = new Map<number, number>();
    const showdowns: Showdown[] = [];

    const live = this.liveSeats();
    if (!walkover) {
      for (const s of live) {
        const all = [...s.hole, ...this.board];
        const score = evaluate(all);
        scores.set(s.id, score);
        showdowns.push({ seatId: s.id, score, name: handName(score), best: bestFive(all) });
      }
    } else if (live[0]) {
      scores.set(live[0].id, 1);
    }

    const payouts: Record<number, number> = {};
    const pots: PotResult[] = [];

    for (const p of this.buildPots()) {
      const contenders = p.eligible.filter((id) => scores.has(id));
      if (contenders.length === 0) {
        // 全員降りた場合の保険：最後に残った人へ
        const fallback = live[0]?.id ?? this.seats[0]!.id;
        payouts[fallback] = (payouts[fallback] ?? 0) + p.amount;
        pots.push({ amount: p.amount, winners: [fallback], score: 0 });
        continue;
      }
      let best = -1;
      for (const id of contenders) best = Math.max(best, scores.get(id)!);
      const winners = contenders.filter((id) => scores.get(id) === best);

      const share = Math.floor(p.amount / winners.length);
      let odd = p.amount - share * winners.length;
      // 端数はボタンの左隣から順に
      const ordered = this.orderFromButton(winners);
      for (const id of ordered) {
        let take = share;
        if (odd > 0) { take += 1; odd -= 1; }
        payouts[id] = (payouts[id] ?? 0) + take;
      }
      pots.push({ amount: p.amount, winners, score: best });
    }

    for (const [id, amt] of Object.entries(payouts)) {
      const s = byId.get(Number(id));
      if (s) s.chips += amt;
    }
    for (const s of this.seats) {
      if (!s.out && s.chips <= 0) s.out = true;
    }

    this.result = { pots, payouts, showdowns, walkover };
    this.street = 'complete';
    this.actor = -1;

    for (const sd of showdowns) {
      this.log.push(`${byId.get(sd.seatId)!.name}: ${sd.name} [${cardsStr(sd.best)}]`);
    }
  }

  private orderFromButton(ids: number[]): number[] {
    const n = this.seats.length;
    const rank = new Map<number, number>();
    for (let i = 1; i <= n; i++) {
      const s = this.seats[(this.button + i) % n]!;
      rank.set(s.id, i);
    }
    return [...ids].sort((a, b) => (rank.get(a) ?? 99) - (rank.get(b) ?? 99));
  }
}
