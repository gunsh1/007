import { Actor, type ActorOpts } from './entity';
import type { Box } from './physics';
import { dirFromVec } from '../gfx/actors';
import type { TileMap } from '../gfx/tiles';
import type { Input } from '../core/input';
import type { Audio } from '../core/audio';

const DODGE_SPEED = 190;
const DODGE_TIME = 0.26;
const DODGE_COOLDOWN = 0.45;
const ATTACK_TIME = 0.22;
const ATTACK_COOLDOWN = 0.10;

/** スタミナ。素手の格闘は、殴るより「息が続くか」のゲームにする。 */
export const ST_MAX = 100;
const ST_LIGHT = 13;
const ST_HEAVY = 27;
const ST_DODGE = 21;
const ST_GRAB = 16;
/** 何もしていない時の回復 */
const ST_REGEN = 21;
/** 動いている時の回復 */
const ST_REGEN_MOVING = 7;
/** [C] で息を整えている時の回復 */
const ST_REGEN_STEADY = 62;
/** 空にした時に動けなくなる時間 */
const EXHAUST_TIME = 1.25;

export interface PlayerFlags {
  /** 回避・攻撃を封じる（会話中・カットシーン） */
  frozen: boolean;
  /** 毒による操作劣化 0..1（第7章） */
  poison: number;
  /** スタミナを使う（格闘章だけ true） */
  stamina: boolean;
}

/**
 * ボンド。移動・回避ダッシュ・近接攻撃までを持つ。
 * 攻撃の当たり判定の解決はステージ側（敵リストを知っているのはステージ）。
 */
export class Player extends Actor {
  flags: PlayerFlags = { frozen: false, poison: 0, stamina: false };

  dodgeT = 0;
  dodgeCd = 0;
  attackT = 0;
  attackCd = 0;
  /** この攻撃で既にヒットを取った相手を覚える（多段ヒット防止） */
  hitThisSwing = new Set<Actor>();
  /** 強攻撃だったか */
  heavySwing = false;
  /** 弾数 */
  ammo = 0;
  maxAmmo = 7;

  /** スタミナ */
  st = ST_MAX;
  /** 息が上がって動けない残り秒 */
  exhaustT = 0;
  /** [C] で息を整えている */
  steadying = false;
  /** マチェットを持っているか（奪える／奪われる） */
  armed = false;
  /** 掴み投げの要求。ステージ側が解決してクリアする。 */
  grabRequested = false;
  /** この振りで武器を落としにいく（強攻撃で相手の予備動作に当てた時） */
  disarmSwing = false;

  /** 歩数音のためのカウンタ */
  private stepAcc = 0;

  constructor(o: Omit<ActorOpts, 'look'> & { look?: ActorOpts['look'] }) {
    super({ look: 'bond', hp: 100, speed: 76, footW: 8, footH: 5, ...o });
  }

  get invulnerable(): boolean { return this.dodgeT > 0 || this.iframes > 0; }
  get attacking(): boolean { return this.attackT > 0; }

  /** その行動を出せるか（スタミナ） */
  private canSpend(cost: number): boolean {
    if (!this.flags.stamina) return true;
    return this.exhaustT <= 0 && this.st >= cost;
  }

  private spend(cost: number): void {
    if (!this.flags.stamina) return;
    this.st = Math.max(0, this.st - cost);
    if (this.st <= 0) this.exhaustT = EXHAUST_TIME;
  }

  update(dt: number, input: Input, audio: Audio, map: TileMap, blockers: readonly Box[]): void {
    this.tickCommon(dt, map, blockers);
    if (this.dead) return;

    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.exhaustT > 0) this.exhaustT -= dt;

    // ── 回避中 ──
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      const [dx, dy] = dirVec(this.facing);
      this.moveBy(dx * DODGE_SPEED * dt, dy * DODGE_SPEED * dt, map, blockers);
      if (this.dodgeT <= 0) this.playState('idle');
      return;
    }

    // ── 攻撃中 ──
    if (this.attackT > 0) {
      this.attackT -= dt;
      if (this.attackT <= 0) {
        this.attackCd = ATTACK_COOLDOWN;
        this.hitThisSwing.clear();
        this.playState('idle');
      }
      return;
    }

    if (this.flags.frozen || this.stun > 0) {
      if (this.state !== 'hurt') this.playState('idle');
      this.regen(dt, false);
      return;
    }

    // ── [C] 息を整える ──
    // 立ち止まって呼吸を整えるとスタミナが一気に戻るが、その間は動けず打たれ弱い。
    this.steadying = this.flags.stamina && this.exhaustT <= 0 && input.isDown('steady');
    if (this.steadying) {
      this.regen(dt, false);
      this.playState('idle');
      return;
    }

    // ── 入力 ──
    let ax = input.axisX();
    let ay = input.axisY();

    // 毒：入力が流れる（第7章）
    if (this.flags.poison > 0) {
      const drift = Math.sin(performance.now() / 700) * this.flags.poison;
      ax += drift * 0.6;
      ay += Math.cos(performance.now() / 900) * this.flags.poison * 0.4;
    }

    const len = Math.hypot(ax, ay);
    let moving = false;
    if (len > 0.05) {
      const nx = ax / Math.max(1, len);
      const ny = ay / Math.max(1, len);
      // 息が上がっている間は足が動かない
      const spd = this.speed * (1 - this.flags.poison * 0.5) * (this.exhaustT > 0 ? 0.45 : 1);
      this.moveBy(nx * spd * dt, ny * spd * dt, map, blockers);
      this.facing = dirFromVec(nx, ny, this.facing);
      this.playState('walk');
      moving = true;

      this.stepAcc += spd * dt;
      if (this.stepAcc > 13) {
        this.stepAcc = 0;
        audio.sfx('step', 0.9 + (this.facing === 'up' ? 0.15 : 0));
      }
    } else {
      this.playState('idle');
      this.stepAcc = 6;
    }
    this.regen(dt, moving);

    if (input.justPressed('dodge') && this.dodgeCd <= 0) {
      if (!this.canSpend(ST_DODGE)) { this.puff(audio); return; }
      this.spend(ST_DODGE);
      this.dodgeT = DODGE_TIME;
      this.dodgeCd = DODGE_TIME + DODGE_COOLDOWN;
      this.iframes = Math.max(this.iframes, DODGE_TIME * 0.8);
      audio.sfx('dodge');
      this.playState('walk', true);
      return;
    }

    // 掴み投げ（よろけている相手を、階段の口へ）
    if (input.justPressed('interact') && this.flags.stamina) {
      if (this.canSpend(ST_GRAB)) {
        this.spend(ST_GRAB);
        this.grabRequested = true;
      } else {
        this.puff(audio);
      }
      return;
    }

    const light = input.justPressed('light');
    const heavy = input.justPressed('heavy');
    if ((light || heavy) && this.attackCd <= 0) {
      const cost = (heavy ? ST_HEAVY : ST_LIGHT) * (this.armed ? 1.35 : 1);
      if (!this.canSpend(cost)) { this.puff(audio); return; }
      this.spend(cost);
      this.attackT = ATTACK_TIME * (heavy ? 1.5 : 1) * (this.armed ? 1.2 : 1);
      this.heavySwing = heavy;
      this.disarmSwing = heavy && !this.armed;
      this.hitThisSwing.clear();
      audio.sfx('whiff', heavy ? 0.8 : 1.1);
      this.playState('attack', true);
    }
  }

  /** スタミナ切れで空振りした時の合図 */
  private puff(audio: Audio): void {
    if (this.attackCd > 0) return;
    this.attackCd = 0.32;
    audio.sfx('whiff', 0.45);
  }

  private regen(dt: number, moving: boolean): void {
    if (!this.flags.stamina) return;
    const rate = this.steadying ? ST_REGEN_STEADY : moving ? ST_REGEN_MOVING : ST_REGEN;
    this.st = Math.min(ST_MAX, this.st + rate * dt);
  }

  /** [C] 中は打たれ弱い */
  override hurt(amount: number, fromX: number, fromY: number, knock = 130): boolean {
    const amt = this.steadying ? Math.round(amount * 1.6) : amount;
    const took = super.hurt(amt, fromX, fromY, knock);
    // 殴られると武器を取り落とす
    if (took && this.armed) this.armed = false;
    return took;
  }

  /** 攻撃の当たり判定が有効なフレームか（振り始めの数フレームは無効） */
  get swingActive(): boolean {
    const total = ATTACK_TIME * (this.heavySwing ? 1.5 : 1);
    const elapsed = total - this.attackT;
    return this.attackT > 0 && elapsed > total * 0.25 && elapsed < total * 0.8;
  }

  get swingDamage(): number {
    const base = this.heavySwing ? 26 : 14;
    return this.armed ? Math.round(base * 1.7) : base;
  }

  get swingKnock(): number { return this.heavySwing ? 210 : 120; }
}

export function dirVec(d: 'up' | 'down' | 'left' | 'right'): [number, number] {
  switch (d) {
    case 'up': return [0, -1];
    case 'down': return [0, 1];
    case 'left': return [-1, 0];
    default: return [1, 0];
  }
}
