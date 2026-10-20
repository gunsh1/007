/**
 * 近接戦の敵。予備動作 → 攻撃判定 → 硬直 のはっきりした周期を持ち、
 * 予備動作を見てから回避を合わせるとカウンターが取れる。
 *
 * 複数体が同時に殴りかかると理不尽になるので、
 * ステージ側が「アクティブアタッカー」を1体だけ選び、残りは距離を取って回る。
 */
import { Actor, type ActorOpts } from './entity';
import { approach, dist, lineOfSight, type Box } from './physics';
import { dirFromVec } from '../gfx/actors';
import type { TileMap } from '../gfx/tiles';
import type { Player } from './player';

export type EnemyKind = 'thug' | 'obanno' | 'guard';

export type EnemyState = 'idle' | 'wait' | 'chase' | 'windup' | 'strike' | 'recover' | 'stagger' | 'winded' | 'dead';

/** 何発続けて振ると息が上がるか */
const STREAK_LIMIT = 3;
const WINDED_TIME = 1.7;

interface Tuning {
  hp: number;
  speed: number;
  /** 攻撃を出し始める距離 */
  reach: number;
  windup: number;
  strike: number;
  recover: number;
  damage: number;
  knock: number;
  /** 連続攻撃の最大段数 */
  combo: number;
  /** 出番待ちのときに保つ距離 */
  orbit: number;
  /** 視認距離 */
  sight: number;
}

const TUNING: Record<EnemyKind, Tuning> = {
  guard: { hp: 45, speed: 52, reach: 12, windup: 0.48, strike: 0.14, recover: 0.50, damage: 9, knock: 120, combo: 1, orbit: 46, sight: 120 },
  thug: { hp: 70, speed: 60, reach: 13, windup: 0.42, strike: 0.14, recover: 0.44, damage: 13, knock: 150, combo: 2, orbit: 42, sight: 150 },
  obanno: { hp: 175, speed: 68, reach: 15, windup: 0.34, strike: 0.16, recover: 0.34, damage: 19, knock: 190, combo: 3, orbit: 38, sight: 200 },
};

export class Enemy extends Actor {
  readonly kind: EnemyKind;
  readonly tune: Tuning;
  aiState: EnemyState = 'idle';
  timer = 0;
  comboLeft = 0;
  /** ステージから毎フレーム設定される。true の時だけ殴りに来る。 */
  activeAttacker = false;
  /** この攻撃で既にプレイヤーに当てたか */
  private hitThisStrike = false;
  /** 周回方向 */
  private orbitDir = 1;
  /** 直前フレームに攻撃判定が有効だったか（カウンター判定用） */
  strikeJustStarted = false;
  /** マチェットを持っているか。落とすと威力が落ちる。 */
  armed = false;
  /** 続けて振った回数。STREAK_LIMIT で息が上がる。 */
  private streak = 0;
  /** 床に落ちた自分の得物を拾いに行く先。ステージ側が設定する。 */
  weaponTarget: { x: number; y: number } | null = null;

  constructor(kind: EnemyKind, o: Omit<ActorOpts, 'look' | 'hp'> & { look: ActorOpts['look'] }) {
    const t = TUNING[kind];
    super({ ...o, hp: t.hp, speed: t.speed, footW: kind === 'obanno' ? 9 : 8, footH: 5 });
    this.kind = kind;
    this.tune = t;
    this.orbitDir = kind === 'thug' ? -1 : 1;
  }

  get isDead(): boolean { return this.dead; }
  /** 攻撃判定が出ているか */
  get striking(): boolean { return this.aiState === 'strike'; }
  /** 予備動作中（ここで回避を合わせるとカウンター） */
  get telegraphing(): boolean { return this.aiState === 'windup'; }

  /** 攻撃判定が出ているか、息が上がっているか */
  get winded(): boolean { return this.aiState === 'winded'; }

  /** カウンターを取られた */
  stagger(seconds = 1.1): void {
    this.aiState = 'stagger';
    this.timer = seconds;
    this.comboLeft = 0;
    this.streak = 0;
    this.playState('hurt', true);
  }

  /** 得物を叩き落とされた */
  disarm(): boolean {
    if (!this.armed) return false;
    this.armed = false;
    this.stagger(0.6);
    return true;
  }

  override hurt(amount: number, fromX: number, fromY: number, knock = 130): boolean {
    const took = super.hurt(amount, fromX, fromY, knock);
    if (took && !this.dead) {
      this.aiState = 'stagger';
      this.timer = 0.34;
      this.comboLeft = 0;
    }
    if (this.dead) this.aiState = 'dead';
    return took;
  }

  update(dt: number, player: Player, map: TileMap, blockers: readonly Box[]): void {
    this.tickCommon(dt, map, blockers);
    this.strikeJustStarted = false;
    if (this.dead) return;

    this.timer -= dt;
    const d = dist(this.x, this.y, player.x, player.y);
    const dx = player.x - this.x;
    const dy = player.y - this.y;

    switch (this.aiState) {
      case 'idle': {
        this.playState('idle');
        if (d < this.tune.sight && lineOfSight(map, this.x, this.chestY, player.x, player.chestY)) {
          this.aiState = 'chase';
        }
        break;
      }

      case 'wait': {
        // 出番待ち：一定距離を保ちながら回り込む
        this.faceTo(dx, dy);
        const want = this.tune.orbit;
        const radial = d < want - 6 ? -1 : d > want + 6 ? 1 : 0;
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        const tx = nx * radial + -ny * 0.75 * this.orbitDir;
        const ty = ny * radial + nx * 0.75 * this.orbitDir;
        const len = Math.hypot(tx, ty) || 1;
        const spd = this.speed * 0.62;
        const r = this.moveBy((tx / len) * spd * dt, (ty / len) * spd * dt, map, blockers);
        if (r.hitX || r.hitY) this.orbitDir *= -1;
        this.playState('walk');
        if (this.activeAttacker) this.aiState = 'chase';
        break;
      }

      case 'chase': {
        this.faceTo(dx, dy);
        // 得物を落とされたら、まず拾いに行く（プレイヤーが先に拾えば取り返せない）
        if (!this.armed && this.weaponTarget) {
          const wx = this.weaponTarget.x - this.x;
          const wy = this.weaponTarget.y - this.y;
          const wd = Math.hypot(wx, wy) || 1;
          if (wd > 8) {
            this.faceTo(wx, wy);
            this.moveBy((wx / wd) * this.speed * dt, (wy / wd) * this.speed * dt, map, blockers);
            this.playState('walk');
            break;
          }
        }
        if (!this.activeAttacker) { this.aiState = 'wait'; break; }
        if (d <= this.tune.reach) {
          this.aiState = 'windup';
          this.timer = this.tune.windup;
          this.comboLeft = this.comboLeft > 0 ? this.comboLeft : 1 + Math.floor(Math.random() * this.tune.combo);
          this.playState('idle');
          break;
        }
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        this.moveBy(nx * this.speed * dt, ny * this.speed * dt, map, blockers);
        this.playState('walk');
        break;
      }

      case 'windup': {
        this.faceTo(dx, dy);
        this.playState('idle');
        // 予備動作中はわずかに踏み込む
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        this.moveBy(nx * 18 * dt, ny * 18 * dt, map, blockers);
        if (this.timer <= 0) {
          this.aiState = 'strike';
          this.timer = this.tune.strike;
          this.hitThisStrike = false;
          this.strikeJustStarted = true;
          this.streak++;
          this.playState('attack', true);
        }
        break;
      }

      case 'strike': {
        if (this.timer <= 0) {
          this.aiState = 'recover';
          this.timer = this.tune.recover;
          this.comboLeft--;
          this.playState('idle');
        }
        break;
      }

      case 'recover': {
        if (this.timer <= 0) {
          // 続けて振りすぎると肩で息をする。ここが最大の反撃の機会。
          if (this.streak >= STREAK_LIMIT) {
            this.streak = 0;
            this.comboLeft = 0;
            this.aiState = 'winded';
            this.timer = WINDED_TIME;
            this.playState('idle');
            break;
          }
          if (this.comboLeft > 0 && d <= this.tune.reach + 6 && this.activeAttacker) {
            this.aiState = 'windup';
            this.timer = this.tune.windup * 0.7;
          } else {
            this.comboLeft = 0;
            this.aiState = this.activeAttacker ? 'chase' : 'wait';
          }
        }
        break;
      }

      case 'winded': {
        this.playState('idle');
        this.faceTo(dx, dy);
        // わずかに後ずさる
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        this.moveBy(-nx * 14 * dt, -ny * 14 * dt, map, blockers);
        if (this.timer <= 0) this.aiState = this.activeAttacker ? 'chase' : 'wait';
        break;
      }

      case 'stagger': {
        this.playState('hurt');
        this.knockX = approach(this.knockX, 0, 700 * dt);
        this.knockY = approach(this.knockY, 0, 700 * dt);
        if (this.timer <= 0) { this.streak = 0; this.aiState = this.activeAttacker ? 'chase' : 'wait'; }
        break;
      }

      case 'dead':
        break;
    }
  }

  private faceTo(dx: number, dy: number): void {
    this.facing = dirFromVec(dx, dy, this.facing);
  }

  /** マチェットを持っていると重い */
  get damage(): number {
    return this.armed ? Math.round(this.tune.damage * 1.6) : this.tune.damage;
  }

  /** 攻撃判定。まだ当てていなければ true を返す（呼び側でダメージ処理） */
  tryHit(player: Player): boolean {
    if (this.aiState !== 'strike' || this.hitThisStrike) return false;
    const a = this.attackBox(this.tune.reach, 14);
    const f = player.foot;
    const overlap = a.x < f.x + f.w && a.x + a.w > f.x && a.y < f.y + f.h + 10 && a.y + a.h > f.y - 10;
    if (!overlap) return false;
    this.hitThisStrike = true;
    return true;
  }
}
