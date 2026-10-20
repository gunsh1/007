/**
 * カジノ・ロワイヤルのポーカーテーブル。第3章・第5章・第8章で共有する。
 * 見下ろしの楕円テーブルに10人が着き、ボンド（席0）が手前、
 * ル・シッフル（席5）が真正面に座る。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawPanel, drawBar, fade, vignette, scanlines } from '../gfx/ui';
import { drawText } from '../gfx/text';
import { anims, type LookName } from '../gfx/actors';
import { drawCard, drawChipStack, highlightCard, CARD_W, CARD_H } from '../gfx/cards-gfx';
import { money, moneyShort } from '../core/save';
import { Rng } from '../core/rng';
import type { MusicTrack } from '../core/audio';
import type { Card } from './cards';
import { Deck } from './deck';
import { HandEngine, makeSeats, type Action, type Seat } from './betting';
import { decide, type Profile } from './opponents';
import { evaluate, handName } from './evaluator';
import { Tells, type TellConfig, type TellKind, type TellReadout } from './tells';

// ── 卓の配置 ───────────────────────────────────────────────────

const TABLE_CX = 192;
const TABLE_CY = 96;
const FELT_RX = 118;
const FELT_RY = 42;
const SEAT_RX = 152;
const SEAT_RY = 64;
export const HERO_SEAT = 0;
export const CHIFFRE_SEAT = 5;

/** 席 k の座標（足元）。席0が手前中央、席5が真正面。 */
function seatPos(k: number, n = 10): { x: number; y: number } {
  const a = (Math.PI / 2) + (k * Math.PI * 2) / n;
  return {
    x: Math.round(TABLE_CX + SEAT_RX * Math.cos(a)),
    y: Math.round(TABLE_CY + SEAT_RY * Math.sin(a)),
  };
}

/** 席からテーブル中心へ向かう単位ベクトル */
function inward(k: number, n = 10): { x: number; y: number } {
  const p = seatPos(k, n);
  const dx = TABLE_CX - p.x;
  const dy = TABLE_CY - p.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

// ── 設定 ──────────────────────────────────────────────────────

export interface TableSeatDef {
  name: string;
  /** 卓のラベル用の短い名前（省略時は name） */
  short?: string;
  look: LookName;
  /** null ならボンド（プレイヤー操作） */
  profile: Profile | null;
  chips: number;
}

export type TableOutcome = 'heroBust' | 'chiffreBust' | 'handsDone' | 'aborted';

/** 1ハンドの結果。章側が「何が起きたか」を見て台詞を選ぶために渡す。 */
export interface HandSummary {
  /** 0起点のハンド番号 */
  no: number;
  /** ボンドの増減 */
  heroDelta: number;
  /** ル・シッフルの増減 */
  chiffreDelta: number;
  /** ショーダウンまで行ったか */
  showdown: boolean;
  /** ショーダウン時の役名（行かなければ空） */
  heroHand: string;
  chiffreHand: string;
  /** このハンドでル・シッフルが見せた癖 */
  tell: TellKind;
  /** ボンドがその癖を観察できていたか */
  tellObserved: boolean;
}

export interface TableConfig {
  title: string;
  seats: TableSeatDef[];
  smallBlind: number;
  bigBlind: number;
  tells: TellConfig;
  music?: MusicTrack;
  /** このハンド数で終了。省略すると誰かが飛ぶまで続く。 */
  maxHands?: number;
  /** ブラインドの上昇。everyHands ハンドごとに factor 倍。 */
  blindUp?: { everyHands: number; factor: number };
  /**
   * 乱数の種。省略すると毎回変わる（＝配り札は完全ランダム）。
   * 再現したい時だけ明示する。
   */
  seed?: number;
  /** ハンド終了ごとに呼ばれる。true を返すと即終了。 */
  onHandEnd?: (scene: TableScene, ctx: SceneCtx) => boolean;
  /** ル・シッフルの癖が出た瞬間。原作 L.71 の「気づく」演出を差し込む。 */
  onTell?: (scene: TableScene, ctx: SceneCtx, kind: 'genuine' | 'fake') => void;
  /**
   * このセッションで最初にル・シッフルが仕掛けた時、必ず本物の癖を見せる。
   * 第3章は「癖を覚えさせる回」なので、運任せにしない。
   */
  forceFirstTell?: boolean;
  /** テーブル終了時 */
  onFinish: (ctx: SceneCtx, outcome: TableOutcome, scene: TableScene) => void;
  /** AI の tilt を固定する */
  tilt?: number;
  /** [P] で飛ばした時の着地点（テスト用） */
  skip?: { hero?: number; chiffre?: number; outcome: TableOutcome };
}

type Phase = 'deal' | 'act' | 'ai' | 'reveal' | 'result' | 'between' | 'done';

interface Bubble { text: string; t: number; color: string }

// ── シーン本体 ─────────────────────────────────────────────────

export class TableScene implements Scene {
  readonly name = 'poker';

  cfg: TableConfig;
  seats: Seat[];
  engine!: HandEngine;
  deck: Deck;
  rng: Rng;
  tells: Tells;

  handNo = 0;
  button: number;
  phase: Phase = 'deal';
  phaseT = 0;
  outcome: TableOutcome = 'handsDone';
  /** このセッションの種。再現したい時に控えられるよう保持する。 */
  readonly seed: number;
  /** 現在のブラインド（blindUp で上がっていく） */
  smallBlind: number;
  bigBlind: number;
  /** 直前のハンドで何が起きたか */
  lastHand: HandSummary | null = null;

  /** ボード演出：何枚まで見せているか */
  shown = 0;
  private aiWait = 0;
  private pendingAction: Action | null = null;
  private bubbles = new Map<number, Bubble>();

  /** 手番の操作 */
  private uiMode: 'buttons' | 'raise' = 'buttons';
  private uiIndex = 0;
  private raiseTo = 0;
  private heroThinkT = 0;

  /** 観察システム */
  private observing = false;
  private lastRead: TellReadout | null = null;
  private tellSeat = -1;

  /** 直近の結果表示用 */
  private winnerText = '';
  private bestCards = new Set<Card>();
  private revealAll = false;
  private fadeIn = 1;
  /** forceFirstTell を使い切ったか */
  private firstTellDone = false;
  /** ハンド開始時のスタック（増減の集計用） */
  private heroAtStart = 0;
  private chiffreAtStart = 0;
  /** このハンドでル・シッフルが見せた癖 */
  private handTell: TellKind = 'none';
  private handTellObserved = false;

  constructor(cfg: TableConfig) {
    this.cfg = cfg;
    // 種を指定しなければ毎回変わる。配り札は完全ランダム。
    this.seed = cfg.seed ?? ((Math.random() * 0x1_0000_0000) >>> 0);
    this.rng = new Rng(this.seed);
    this.deck = new Deck(this.rng.fork());
    this.tells = new Tells(cfg.tells);
    this.seats = makeSeats(cfg.seats.map((s, i) => ({ id: i, name: s.name, chips: s.chips, hero: s.profile === null })));
    this.smallBlind = cfg.smallBlind;
    this.bigBlind = cfg.bigBlind;
    // ボタンの初期位置もランダム（毎回同じ席順の展開にしない）
    this.button = this.rng.int(this.seats.length);
  }

  // ── 参照 ────────────────────────────────────────────────────

  get hero(): Seat { return this.seats[HERO_SEAT]!; }
  get chiffre(): Seat { return this.seats[CHIFFRE_SEAT]!; }
  get heroChips(): number { return this.hero.chips; }
  get chiffreChips(): number { return this.chiffre.chips; }

  // ── ライフサイクル ───────────────────────────────────────────

  onEnter(ctx: SceneCtx): void {
    ctx.audio.music(this.cfg.music ?? 'casino');
    // デバッグの「ポーカーを飛ばす」が立っていれば、卓に着かずに結果だけ出す
    if (ctx.debug.skipPoker) { this.skipSession(ctx); return; }
    this.startHand(ctx);
  }

  /** テスト用。結果だけ確定させて次へ進む。 */
  private skipSession(ctx: SceneCtx): void {
    const s = this.cfg.skip;
    if (s) {
      if (s.hero !== undefined) this.hero.chips = s.hero;
      if (s.chiffre !== undefined) this.chiffre.chips = s.chiffre;
      this.finish(ctx, s.outcome);
    } else {
      this.finish(ctx, 'handsDone');
    }
  }

  private startHand(ctx: SceneCtx): void {
    this.button = this.nextOccupied(this.button);
    this.deck = new Deck(new Rng(this.rng.int(0x7fffffff)));

    // ブラインドの上昇。長引くほど短いスタックが焼かれていく。
    const up = this.cfg.blindUp;
    if (up && this.handNo > 0 && this.handNo % up.everyHands === 0) {
      this.smallBlind = Math.round(this.smallBlind * up.factor);
      this.bigBlind = Math.round(this.bigBlind * up.factor);
      this.pushBubble(CHIFFRE_SEAT, `ブラインド ${moneyShort(this.bigBlind)}`, PAL.GOLD_L);
    }

    // ブラインドを払う前のスタックを控えておく（増減の集計用）
    this.heroAtStart = this.hero.chips;
    this.chiffreAtStart = this.chiffre.chips;
    this.handTell = 'none';
    this.handTellObserved = false;

    this.engine = new HandEngine(
      this.seats,
      { button: this.button, smallBlind: this.smallBlind, bigBlind: this.bigBlind },
      this.deck,
    );
    this.engine.begin();

    this.shown = 0;
    this.bubbles.clear();
    this.tells.clear();
    this.lastRead = null;
    this.tellSeat = -1;
    this.winnerText = '';
    this.bestCards.clear();
    this.revealAll = false;
    this.uiMode = 'buttons';
    this.uiIndex = 0;
    this.phase = 'deal';
    this.phaseT = 0;
    ctx.audio.sfx('card');

    if (this.engine.isComplete) { this.phase = 'result'; this.phaseT = 0; }
  }

  private nextOccupied(from: number): number {
    const n = this.seats.length;
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (!this.seats[idx]!.out) return idx;
    }
    return from;
  }

  private pushBubble(seat: number, text: string, color: string = PAL.WHITE): void {
    this.bubbles.set(seat, { text, t: 2.0, color });
  }

  // ── 進行 ────────────────────────────────────────────────────

  private syncPhase(ctx: SceneCtx): void {
    if (this.engine.isComplete) {
      this.finishHand(ctx);
      return;
    }
    if (this.engine.board.length > this.shown) {
      this.phase = 'reveal';
      this.phaseT = 0;
      return;
    }
    const a = this.engine.actorSeat;
    if (!a) { this.phase = 'between'; this.phaseT = 0; return; }
    if (a.hero) {
      this.phase = 'act';
      this.uiMode = 'buttons';
      this.uiIndex = 0;
      this.heroThinkT = 0;
      const lg = this.engine.legal();
      this.raiseTo = Math.min(lg.maxRaiseTo, Math.max(lg.minRaiseTo, this.bigBlind * 3));
    } else {
      this.phase = 'ai';
      this.phaseT = 0;
      // 実際の待ち時間は決定内容を見てから updateAi 側で詰める
      this.aiWait = this.engine.actor === CHIFFRE_SEAT ? 1.1 : 0.4;
      this.pendingAction = null;
    }
  }

  private finishHand(ctx: SceneCtx): void {
    this.phase = 'result';
    this.phaseT = 0;
    this.revealAll = !(this.engine.result?.walkover ?? true);
    // ボードは全部見せる
    this.shown = this.engine.board.length;

    const r = this.engine.result;
    let heroHand = '';
    let chiffreHand = '';
    if (r) {
      const heroWon = r.payouts[this.hero.id] ?? 0;
      const parts: string[] = [];
      for (const p of r.pots) {
        const names = p.winners.map((id) => this.seats[id]!.name).join('・');
        parts.push(`${names} が ${money(p.amount)}`);
      }
      this.winnerText = parts.join(' / ');
      for (const sd of r.showdowns) {
        this.pushBubble(sd.seatId, sd.name, sd.seatId === this.hero.id ? PAL.GOLD_L : PAL.SILVER);
        for (const c of sd.best) this.bestCards.add(c);
        if (sd.seatId === HERO_SEAT) heroHand = sd.name;
        if (sd.seatId === CHIFFRE_SEAT) chiffreHand = sd.name;
      }
      ctx.audio.sfx(heroWon > 0 ? 'chips.push' : 'card.flip');
    }

    // ショーダウンで手が割れたぶんの学習。癖が本物だったか偽物だったかを事後に確認できる。
    if (this.revealAll) {
      const gain = Tells.showdownGain(this.handTell, this.handTellObserved);
      if (gain > 0) ctx.save.tellRead = Math.min(100, ctx.save.tellRead + gain);
    }

    this.lastHand = {
      no: this.handNo,
      heroDelta: this.hero.chips - this.heroAtStart,
      chiffreDelta: this.chiffre.chips - this.chiffreAtStart,
      showdown: this.revealAll,
      heroHand,
      chiffreHand,
      tell: this.handTell,
      tellObserved: this.handTellObserved,
    };
  }

  update(ctx: SceneCtx, dt: number): void {
    if (!this.engine || this.phase === 'done') return;

    // [P] でセッションを飛ばす（テスト用）
    if (ctx.input.justPressed('skip')) {
      ctx.audio.sfx('ui.cancel');
      this.skipSession(ctx);
      return;
    }

    // 待ち時間の短縮。10人卓は放っておくと1ハンドが長い。
    //  ・自分の手番以外は [J] 押しっぱなしで早送り
    //  ・自分が降りたハンドは、残りを自動で早回しする
    const skippable = this.phase === 'ai' || this.phase === 'reveal' || this.phase === 'result' || this.phase === 'between';
    if (skippable) {
      const heroDone = this.hero.folded || this.hero.out;
      if (ctx.input.isDown('light')) dt *= 5;
      else if (heroDone) dt *= 3;
    }
    this.phaseT += dt;
    if (this.fadeIn > 0) this.fadeIn = Math.max(0, this.fadeIn - dt * 1.6);

    for (const [k, b] of this.bubbles) {
      b.t -= dt;
      if (b.t <= 0) this.bubbles.delete(k);
    }

    this.observing = ctx.input.isDown('observe');
    this.tells.update(dt, this.observing);
    if (this.observing && this.tells.visible) {
      this.lastRead = this.tells.readout(ctx.save.tellRead);
    }

    switch (this.phase) {
      case 'deal':
        if (this.phaseT > 0.45) this.syncPhase(ctx);
        break;

      case 'reveal':
        if (this.phaseT > 0.15) {
          this.phaseT = 0;
          this.shown++;
          ctx.audio.sfx('card.flip', 1 + this.shown * 0.04);
          if (this.shown >= this.engine.board.length) this.syncPhase(ctx);
        }
        break;

      case 'ai':
        this.updateAi(ctx, dt);
        break;

      case 'act':
        this.heroThinkT += dt;
        this.updateHeroInput(ctx);
        break;

      case 'result':
        if (this.phaseT > (this.revealAll ? 2.2 : 1.0) || ctx.input.justPressed('light')) {
          this.phase = 'between';
          this.phaseT = 0;
        }
        break;

      case 'between':
        if (this.phaseT > 0.2) this.nextHandOrFinish(ctx);
        break;
    }
  }

  private updateAi(ctx: SceneCtx, _dt: number): void {
    const idx = this.engine.actor;
    if (idx < 0) { this.syncPhase(ctx); return; }

    // 思考開始の瞬間に決定を作り、癖を発火させる
    if (this.pendingAction === null) {
      const def = this.cfg.seats[idx]!;
      const prof = def.profile as Profile;
      const d = decide(this.engine, idx, prof, this.rng, this.cfg.tilt ?? 0);
      this.pendingAction = d.action;

      // 降りるだけの相手に長く待たされないようにする。
      // ただしル・シッフルは癖を見せる時間が要るので短くしない。
      if (idx !== CHIFFRE_SEAT) {
        this.aiWait = d.action.kind === 'fold' ? 0.12 : this.rng.float(0.26, 0.44);
      } else {
        this.aiWait = d.action.kind === 'fold' ? 0.35 : this.rng.float(1.0, 1.45);
      }

      if (idx === CHIFFRE_SEAT) {
        // 癖は実際のブラフ／バリューから決まる。仕込みは無い。
        let kind = this.tells.begin(d, this.rng, ctx.save.tellRead);
        // セッション最初の仕掛けだけは、教える回では必ず見せる（第3章）
        const aggressive = d.action.kind === 'raise' || d.action.kind === 'allin';
        if (this.cfg.forceFirstTell && !this.firstTellDone && aggressive) {
          this.firstTellDone = true;
          this.tells.kind = 'genuine';
          this.tells.t = 0;
          this.tells.observed = false;
          kind = 'genuine';
        }
        this.tellSeat = kind === 'none' ? -1 : idx;
        if (kind !== 'none') {
          this.handTell = kind;
          ctx.audio.sfx('tick', 0.6);
          this.cfg.onTell?.(this, ctx, kind);
        }
      }
    }

    if (this.phaseT < this.aiWait) return;

    const a = this.pendingAction;
    this.pendingAction = null;
    const seat = this.seats[idx]!;
    const before = seat.bet;
    this.engine.act(a);
    const put = seat.bet - before;

    const label =
      a.kind === 'fold' ? 'フォールド'
        : a.kind === 'check' ? 'チェック'
          : a.kind === 'call' ? `コール ${moneyShort(put)}`
            : seat.allIn ? `オールイン ${moneyShort(seat.bet)}`
              : `レイズ ${moneyShort(seat.bet)}`;
    this.pushBubble(idx, label, a.kind === 'fold' ? PAL.STEEL : PAL.WHITE);
    ctx.audio.sfx(a.kind === 'fold' ? 'card' : 'chip', 1 + this.rng.float(-0.1, 0.1));

    // 癖を観察できていたら読みが上がる
    if (idx === CHIFFRE_SEAT) {
      if (this.tells.observed) this.handTellObserved = true;
      const gain = this.tells.reward();
      if (gain > 0) ctx.save.tellRead = Math.min(100, ctx.save.tellRead + gain);
    }

    this.syncPhase(ctx);
  }

  // ── ボンドの操作 ─────────────────────────────────────────────

  private heroButtons(): { id: 'fold' | 'check' | 'call' | 'raise' | 'allin'; label: string }[] {
    const lg = this.engine.legal();
    const out: { id: 'fold' | 'check' | 'call' | 'raise' | 'allin'; label: string }[] = [];
    out.push({ id: 'fold', label: 'フォールド' });
    if (lg.check) out.push({ id: 'check', label: 'チェック' });
    if (lg.call) out.push({ id: 'call', label: `コール ${moneyShort(lg.callAmount)}` });
    if (lg.raise && lg.maxRaiseTo > lg.minRaiseTo) out.push({ id: 'raise', label: lg.currentBet > 0 ? 'レイズ' : 'ベット' });
    if (lg.raise) out.push({ id: 'allin', label: 'オールイン' });
    return out;
  }

  private updateHeroInput(ctx: SceneCtx): void {
    const lg = this.engine.legal();
    const inp = ctx.input;

    if (this.uiMode === 'raise') {
      const bb = this.bigBlind;
      const step = inp.isDown('heavy') ? bb * 10 : bb;
      if (inp.justPressed('left')) { this.raiseTo = Math.max(lg.minRaiseTo, this.raiseTo - step); ctx.audio.sfx('ui.move', 0.9); }
      if (inp.justPressed('right')) { this.raiseTo = Math.min(lg.maxRaiseTo, this.raiseTo + step); ctx.audio.sfx('ui.move', 1.1); }
      if (inp.justPressed('up')) {
        this.raiseTo = Math.min(lg.maxRaiseTo, Math.max(lg.minRaiseTo, lg.currentBet + Math.round(this.engine.pot)));
        ctx.audio.sfx('ui.move', 1.2);
      }
      if (inp.justPressed('down')) {
        this.raiseTo = Math.min(lg.maxRaiseTo, Math.max(lg.minRaiseTo, lg.currentBet + Math.round(this.engine.pot / 2)));
        ctx.audio.sfx('ui.move', 0.8);
      }
      if (inp.justPressed('cancel')) { this.uiMode = 'buttons'; ctx.audio.sfx('ui.cancel'); }
      if (inp.justPressed('light')) this.commitHero(ctx, { kind: 'raise', to: this.raiseTo }, true);
      return;
    }

    const btns = this.heroButtons();
    if (inp.justPressed('left')) { this.uiIndex = (this.uiIndex - 1 + btns.length) % btns.length; ctx.audio.sfx('ui.move'); }
    if (inp.justPressed('right')) { this.uiIndex = (this.uiIndex + 1) % btns.length; ctx.audio.sfx('ui.move'); }
    if (!inp.justPressed('light')) return;

    const b = btns[this.uiIndex]!;
    switch (b.id) {
      case 'fold': this.commitHero(ctx, { kind: 'fold' }, false); break;
      case 'check': this.commitHero(ctx, { kind: 'check' }, false); break;
      case 'call': this.commitHero(ctx, { kind: 'call' }, false); break;
      case 'allin': this.commitHero(ctx, { kind: 'allin' }, true); break;
      case 'raise':
        this.uiMode = 'raise';
        this.raiseTo = Math.min(lg.maxRaiseTo, Math.max(lg.minRaiseTo, lg.currentBet + Math.round(this.engine.pot * 0.6)));
        ctx.audio.sfx('ui.confirm');
        break;
    }
  }

  private commitHero(ctx: SceneCtx, a: Action, aggressive: boolean): void {
    const seat = this.hero;
    const before = seat.bet;

    // ボンド自身の癖：攻撃時とそうでない時で考える時間に差が出ると読まれる
    const hesitation = this.heroThinkT;
    const bias = aggressive ? hesitation : -hesitation;
    ctx.save.tellLeak = Math.max(0, Math.min(100, ctx.save.tellLeak + Math.sign(bias) * Math.min(2, Math.abs(bias) * 0.6)));

    this.engine.act(a);
    const put = seat.bet - before;
    const label =
      a.kind === 'fold' ? 'フォールド'
        : a.kind === 'check' ? 'チェック'
          : a.kind === 'call' ? `コール ${moneyShort(put)}`
            : seat.allIn ? `オールイン ${moneyShort(seat.bet)}`
              : `レイズ ${moneyShort(seat.bet)}`;
    this.pushBubble(HERO_SEAT, label, PAL.GOLD_L);
    ctx.audio.sfx(a.kind === 'fold' ? 'card' : 'chips.push');
    this.lastRead = null;
    this.uiMode = 'buttons';
    this.syncPhase(ctx);
  }

  // ── ハンド間 ────────────────────────────────────────────────

  private nextHandOrFinish(ctx: SceneCtx): void {
    this.handNo++;

    if (this.cfg.onHandEnd?.(this, ctx)) { this.finish(ctx, this.outcome); return; }
    if (this.hero.out || this.hero.chips <= 0) { this.finish(ctx, 'heroBust'); return; }
    if (this.chiffre.out || this.chiffre.chips <= 0) { this.finish(ctx, 'chiffreBust'); return; }
    if (this.cfg.maxHands !== undefined && this.handNo >= this.cfg.maxHands) {
      this.finish(ctx, 'handsDone');
      return;
    }

    this.startHand(ctx);
  }

  /** 外部（章スクリプト）から終わらせる */
  finish(ctx: SceneCtx, outcome: TableOutcome): void {
    if (this.phase === 'done') return;
    this.outcome = outcome;
    this.phase = 'done';
    ctx.save.chips = this.hero.chips;
    ctx.save.chiffreChips = this.chiffre.chips;
    this.cfg.onFinish(ctx, outcome, this);
  }

  // ── 描画 ────────────────────────────────────────────────────

  render(ctx: SceneCtx, _alpha: number): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    g.fillStyle = PAL.INK;
    g.fillRect(0, 0, GAME_W, GAME_H);

    // 飛ばした場合は卓に着かないまま pop される。engine はまだ無い。
    if (!this.engine) return;

    this.drawTable(g);
    this.drawBoardAndPot(ctx, g, ui);
    for (let i = 0; i < this.seats.length; i++) this.drawSeat(ctx, g, ui, i);
    vignette(g, 0.62);
    this.drawHeroPanel(ctx, g, ui);
    this.drawObserve(ctx, g, ui);
    this.drawTopBar(ctx, ui);
    scanlines(g, 0.05);
    if (this.fadeIn > 0) fade(g, this.fadeIn);
  }

  private drawTable(g: CanvasRenderingContext2D): void {
    // 木の縁
    g.fillStyle = PAL.BROWN;
    g.beginPath();
    g.ellipse(TABLE_CX, TABLE_CY, FELT_RX + 7, FELT_RY + 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PAL.BROWN_L;
    g.beginPath();
    g.ellipse(TABLE_CX, TABLE_CY - 1, FELT_RX + 6, FELT_RY + 6, 0, 0, Math.PI * 2);
    g.fill();
    // フェルト
    g.fillStyle = PAL.FELT_D;
    g.beginPath();
    g.ellipse(TABLE_CX, TABLE_CY, FELT_RX, FELT_RY, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PAL.FELT;
    g.beginPath();
    g.ellipse(TABLE_CX, TABLE_CY - 1, FELT_RX - 2, FELT_RY - 2, 0, 0, Math.PI * 2);
    g.fill();
    // 中央のライン
    g.strokeStyle = rgba(PAL.FELT_L, 0.5);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(TABLE_CX + 0.5, TABLE_CY - 0.5, FELT_RX - 14, FELT_RY - 12, 0, 0, Math.PI * 2);
    g.stroke();
  }

  private drawBoardAndPot(ctx: SceneCtx, g: CanvasRenderingContext2D, ui: CanvasRenderingContext2D): void {
    const board = this.engine.board;
    const total = 5;
    const gap = 2;
    const w = total * CARD_W + (total - 1) * gap;
    const x0 = Math.round(TABLE_CX - w / 2);
    const y = TABLE_CY - 4;

    for (let i = 0; i < total; i++) {
      const x = x0 + i * (CARD_W + gap);
      if (i < this.shown && board[i] !== undefined) {
        drawCard(g, board[i]!, x, y, 1);
        if (this.bestCards.has(board[i]!)) highlightCard(g, x, y, 1);
      } else {
        // まだ出ていない場所は薄い枠だけ
        g.fillStyle = rgba(PAL.VOID, 0.18);
        g.fillRect(x, y, CARD_W, CARD_H);
      }
    }

    // ポット
    const pot = this.engine.pot;
    if (pot > 0) {
      drawChipStack(g, TABLE_CX - 40, y - 6, pot);
      drawChipStack(g, TABLE_CX + 40, y - 6, pot);
      drawText(ui, `POT ${money(pot)}`, TABLE_CX, y - 16, {
        size: 8, color: PAL.GOLD_L, align: 'center', bold: true, shadow: true,
      });
    }

    if (this.winnerText && (this.phase === 'result' || this.phase === 'between')) {
      drawText(ui, this.winnerText, TABLE_CX, y + CARD_H + 4, {
        size: 8, color: PAL.GOLD_L, align: 'center', shadow: true, outline: true,
      });
    }
    void ctx;
  }

  private drawSeat(ctx: SceneCtx, g: CanvasRenderingContext2D, ui: CanvasRenderingContext2D, k: number): void {
    const s = this.seats[k]!;
    const def = this.cfg.seats[k]!;
    const label = def.short ?? def.name;
    const p = seatPos(k, this.seats.length);
    const inw = inward(k, this.seats.length);
    const isTop = p.y < TABLE_CY;
    const acting = this.engine.actor === k && (this.phase === 'act' || this.phase === 'ai');
    // ラベルは卓の外側へ逃がす（カードや隣席と重ならないように）
    const lx = Math.max(30, Math.min(GAME_W - 30, Math.round(p.x - inw.x * 10)));

    if (s.out) {
      drawText(ui, label, lx, isTop ? p.y + 2 : p.y - 20, {
        size: 6, color: rgba(PAL.STEEL, 0.5), align: 'center',
      });
      return;
    }

    // 手番のリング
    if (acting) {
      const pulse = 0.5 + 0.5 * Math.sin(ctx.time * 7);
      g.strokeStyle = rgba(PAL.GOLD_L, 0.35 + pulse * 0.5);
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(p.x + 0.5, p.y - 6.5, 11, 12, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // キャラクター（着席）。ル・シッフルの癖はここで出る。
    const a = anims(def.look);
    const showTell = k === this.tellSeat && this.tells.visible;
    const sprite = showTell ? a.seatedTemple : a.seated;
    const dim = s.folded ? 0.42 : 1;
    g.globalAlpha = dim;
    sprite.draw(g, p.x, p.y);
    g.globalAlpha = 1;

    // 癖が出ている時は微かに赤く縁取る（観察していなくても目視できる余地を残す）
    if (showTell) {
      const f = 0.25 + 0.25 * Math.sin(ctx.time * 18);
      g.globalAlpha = f;
      sprite.drawSilhouette(g, p.x, p.y, PAL.RED_L);
      g.globalAlpha = 1;
    }

    // ホールカード（自分以外は裏。ショーダウンで表）
    if (s.hole.length === 2 && !s.folded && k !== HERO_SEAT) {
      const cx = Math.round(p.x + inw.x * 22);
      const cy = Math.round(p.y + inw.y * 14 - 8);
      if (this.revealAll && this.phase !== 'between') {
        drawCard(g, s.hole[0]!, cx - CARD_W - 1, cy - 6, 1);
        drawCard(g, s.hole[1]!, cx + 1, cy - 6, 1);
        if (this.bestCards.has(s.hole[0]!)) highlightCard(g, cx - CARD_W - 1, cy - 6, 1);
        if (this.bestCards.has(s.hole[1]!)) highlightCard(g, cx + 1, cy - 6, 1);
      } else {
        g.fillStyle = PAL.BLOOD;
        g.fillRect(cx - 8, cy, 7, 10);
        g.fillRect(cx + 1, cy, 7, 10);
        g.fillStyle = PAL.GOLD;
        g.fillRect(cx - 8, cy, 7, 1);
        g.fillRect(cx + 1, cy, 7, 1);
      }
    }

    // 賭けたチップ
    if (s.bet > 0) {
      const bx = Math.round(p.x + inw.x * 38);
      const by = Math.round(p.y + inw.y * 26 - 2);
      drawChipStack(g, bx, by, s.bet);
      drawText(ui, moneyShort(s.bet), bx, by + 3, { size: 6, color: PAL.GOLD_L, align: 'center', outline: true });
    }

    // 名前とスタック（ボンドは下のパネルに出るので卓には出さない）
    if (k !== HERO_SEAT) {
      const ly = isTop ? p.y + 2 : p.y - 22;
      const nameColor = s.folded ? rgba(PAL.STEEL, 0.6) : (k === CHIFFRE_SEAT ? PAL.RED_L : PAL.SILVER);
      drawText(ui, label, lx, ly, { size: 6, color: nameColor, align: 'center', outline: true });
      drawText(ui, s.allIn ? 'ALL IN' : moneyShort(s.chips), lx, ly + 7, {
        size: 6, color: s.allIn ? PAL.GOLD : (s.folded ? rgba(PAL.STEEL, 0.6) : PAL.WHITE), align: 'center', outline: true,
      });
    }

    // 行動の吹き出し
    const b = this.bubbles.get(k);
    if (b) {
      const by = isTop ? p.y + 17 : p.y - 33;
      drawText(ui, b.text, lx, by, {
        size: 7, color: b.color, align: 'center', outline: true, alpha: Math.min(1, b.t * 2),
      });
    }
  }

  private drawHeroPanel(ctx: SceneCtx, g: CanvasRenderingContext2D, ui: CanvasRenderingContext2D): void {
    const y0 = 166;
    g.fillStyle = rgba(PAL.VOID, 0.92);
    g.fillRect(0, y0, GAME_W, GAME_H - y0);
    g.fillStyle = PAL.GOLD;
    g.fillRect(0, y0, GAME_W, 1);

    // ボンドのホールカード（2倍）
    const h = this.hero;
    if (h.hole.length === 2) {
      drawCard(g, h.hole[0]!, 5, y0 + 4, 2);
      drawCard(g, h.hole[1]!, 5 + CARD_W * 2 + 3, y0 + 4, 2);
      if (this.bestCards.has(h.hole[0]!)) highlightCard(g, 5, y0 + 4, 2);
      if (this.bestCards.has(h.hole[1]!)) highlightCard(g, 5 + CARD_W * 2 + 3, y0 + 4, 2);
    }

    const px = 84;
    // 現在の役
    if (h.hole.length === 2 && this.shown >= 3) {
      const made = handName(evaluate([...h.hole, ...this.engine.board.slice(0, this.shown)]));
      drawText(ui, made, px, y0 + 4, { size: 8, color: PAL.GOLD_L, bold: true, shadow: true });
    } else if (h.hole.length === 2) {
      drawText(ui, 'プリフロップ', px, y0 + 4, { size: 8, color: PAL.STEEL, shadow: true });
    }
    drawText(ui, `所持 ${money(h.chips)}`, GAME_W - 6, y0 + 4, { size: 8, color: PAL.WHITE, align: 'right', shadow: true });

    if (this.phase === 'act') this.drawActionBar(ctx, g, ui, px, y0 + 16);
    else if (this.phase === 'ai') {
      const who = this.cfg.seats[this.engine.actor]?.name ?? '';
      drawText(ui, `${who} が考えている…`, px, y0 + 20, { size: 8, color: PAL.SILVER });
      drawText(ui, '[Q] 観察', px, y0 + 32, { size: 7, color: rgba(PAL.GOLD_L, 0.8) });
    } else if (this.phase === 'result') {
      drawText(ui, '[J] 次のハンドへ', px, y0 + 24, { size: 8, color: PAL.SILVER });
    }
  }

  private drawActionBar(ctx: SceneCtx, g: CanvasRenderingContext2D, ui: CanvasRenderingContext2D, x: number, y: number): void {
    const lg = this.engine.legal();

    if (this.uiMode === 'raise') {
      const span = Math.max(1, lg.maxRaiseTo - lg.minRaiseTo);
      const t = (this.raiseTo - lg.minRaiseTo) / span;
      const barW = GAME_W - x - 14;
      drawBar(g, x, y + 12, barW, 5, t, PAL.GOLD, PAL.CHARCOAL, PAL.SLATE);
      drawText(ui, `レイズ額 ${money(this.raiseTo)}`, x, y - 2, { size: 8, color: PAL.GOLD_L, bold: true });
      drawText(ui, '← → 調整 (K押しで大きく) / ↑ ポット / ↓ 半ポット / J 決定 / ESC 戻る', x, y + 20, {
        size: 6, color: rgba(PAL.SILVER, 0.8),
      });
      return;
    }

    const btns = this.heroButtons();
    const bw = Math.floor((GAME_W - x - 8) / btns.length);
    for (let i = 0; i < btns.length; i++) {
      const bx = x + i * bw;
      const sel = i === this.uiIndex;
      drawPanel(g, bx, y, bw - 3, 16, {
        fill: sel ? rgba(PAL.BLOOD, 0.9) : rgba(PAL.CHARCOAL, 0.85),
        border: sel ? PAL.GOLD_L : PAL.SLATE,
        accent: sel ? PAL.GOLD : PAL.STEEL,
      });
      drawText(ui, btns[i]!.label, bx + (bw - 3) / 2, y + 4, {
        size: 7, color: sel ? PAL.WHITE : PAL.SILVER, align: 'center', bold: sel,
      });
    }
    if (lg.callAmount > 0) {
      drawText(ui, `コールに ${money(lg.callAmount)}`, x, y + 20, { size: 6, color: PAL.SILVER });
    }
    void ctx;
  }

  /**
   * 観察モード：画面を落として相手だけ照らす。
   * 卓の名前・チップは UI レイヤに描かれているため、暗幕も UI レイヤに置く。
   * （ゲームレイヤを暗くしても、その上に乗る文字は暗くならない）
   */
  private drawObserve(ctx: SceneCtx, _g: CanvasRenderingContext2D, ui: CanvasRenderingContext2D): void {
    if (!this.observing) return;
    const target = CHIFFRE_SEAT;
    const p = seatPos(target, this.seats.length);

    ui.save();
    ui.beginPath();
    ui.rect(0, 0, GAME_W, 166);
    ui.arc(p.x, p.y - 8, 26, 0, Math.PI * 2, true);
    ui.fillStyle = rgba(PAL.VOID, 0.78);
    ui.fill('evenodd');
    ui.restore();

    ui.strokeStyle = rgba(PAL.GOLD_L, 0.75);
    ui.lineWidth = 1;
    ui.beginPath();
    ui.arc(p.x + 0.5, p.y - 7.5, 26, 0, Math.PI * 2);
    ui.stroke();

    const read = this.tells.visible ? this.tells.readout(ctx.save.tellRead) : this.lastRead;
    const bw = 176;
    const bh = 36;
    const bx = GAME_W / 2 - bw / 2;
    const by = 124;
    drawPanel(ui, bx, by, bw, bh, { fill: rgba(PAL.VOID, 0.96), border: PAL.GOLD, accent: PAL.GOLD_L });
    drawText(ui, `観察：${this.cfg.seats[target]!.name}`, GAME_W / 2, by + 5, {
      size: 7, color: PAL.GOLD_L, align: 'center', bold: true,
    });
    if (read) {
      const label = this.tells.visible ? '左のこめかみに手が伸びた' : '直前に見えた仕草';
      drawText(ui, label, GAME_W / 2, by + 15, { size: 7, color: PAL.WHITE, align: 'center' });
      drawText(
        ui,
        read.suspicious
          ? `見立て：${read.text}（信頼度 ${Math.round(read.confidence)}%）…わざとらしい`
          : `見立て：${read.text}　信頼度 ${Math.round(read.confidence)}%`,
        GAME_W / 2, by + 25,
        { size: 6, color: read.suspicious ? PAL.RED_L : PAL.SILVER, align: 'center' },
      );
    } else {
      drawText(ui, '手がかりなし', GAME_W / 2, by + 17, { size: 7, color: PAL.STEEL, align: 'center' });
    }
  }

  private drawTopBar(ctx: SceneCtx, ui: CanvasRenderingContext2D): void {
    drawText(ui, this.cfg.title, 6, 3, { size: 7, color: PAL.STEEL, outline: true });
    drawText(ui, `読み ${ctx.save.tellRead}`, 6, 12, { size: 6, color: rgba(PAL.GOLD_L, 0.85), outline: true });
    const hand = this.cfg.maxHands === undefined
      ? `HAND ${this.handNo + 1}`
      : `HAND ${this.handNo + 1}/${this.cfg.maxHands}`;
    drawText(ui, hand, GAME_W - 6, 3, { size: 7, color: PAL.STEEL, align: 'right', outline: true });
    drawText(ui, `BLIND ${moneyShort(this.smallBlind)}/${moneyShort(this.bigBlind)}`, GAME_W - 6, 12, {
      size: 6, color: rgba(PAL.SILVER, 0.75), align: 'right', outline: true,
    });
    drawText(ui, '[P] 卓を飛ばす', GAME_W - 6, 21, {
      size: 6, color: rgba(PAL.STEEL, 0.8), align: 'right', outline: true,
    });
  }
}
