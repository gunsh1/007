import { Animator } from '../gfx/sprites';
import { anims, selectAnim, dir3, flipFor, type CharAnims, type Dir4, type LookName } from '../gfx/actors';
import { shadowEllipse, strokeRect } from '../gfx/ui';
import { PAL, rgba } from '../gfx/palette';
import type { Box } from './physics';
import { moveBox, approach } from './physics';
import type { TileMap } from '../gfx/tiles';

export type ActorState = 'idle' | 'walk' | 'attack' | 'aim' | 'hurt' | 'downed';

export interface ActorOpts {
  look: LookName;
  x: number;
  y: number;
  hp?: number;
  speed?: number;
  facing?: Dir4;
  /** 足元の当たり判定サイズ */
  footW?: number;
  footH?: number;
}

/**
 * 見下ろし視点の人型アクター。
 * x,y は「足元中央」。当たり判定は足元の小さい矩形のみで、上半身は素通りさせる。
 */
export class Actor {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  /** 前フレームの位置。描画時の補間に使う。 */
  px: number;
  py: number;

  readonly footW: number;
  readonly footH: number;

  facing: Dir4;
  state: ActorState = 'idle';
  look: LookName;

  hp: number;
  maxHp: number;
  speed: number;

  /** 無敵時間（秒） */
  iframes = 0;
  /** ノックバック速度 */
  knockX = 0;
  knockY = 0;
  /** 行動不能時間（攻撃硬直・のけぞり） */
  stun = 0;
  dead = false;
  /** 描画のちらつき（被弾点滅） */
  flashT = 0;
  /** 頭上に出す名前。空なら出さない。 */
  label = '';
  labelColor: string | null = null;

  protected animator: Animator;
  protected set: CharAnims;

  constructor(o: ActorOpts) {
    this.x = o.x;
    this.y = o.y;
    this.px = o.x;
    this.py = o.y;
    this.look = o.look;
    this.maxHp = o.hp ?? 100;
    this.hp = this.maxHp;
    this.speed = o.speed ?? 62;
    this.facing = o.facing ?? 'down';
    this.footW = o.footW ?? 8;
    this.footH = o.footH ?? 5;
    this.set = anims(o.look);
    this.animator = new Animator(this.set.idle.down, 'idle:down');
  }

  /** 見た目を差し替える（タキシード→血まみれ等） */
  setLook(look: LookName): void {
    this.look = look;
    this.set = anims(look);
  }

  get foot(): Box {
    return { x: this.x - this.footW / 2, y: this.y - this.footH, w: this.footW, h: this.footH };
  }

  /** 胴体のおおよその中心（射撃・視線判定用） */
  get chestY(): number { return this.y - 10; }

  /** 近接攻撃の判定ボックス。向きに応じて前方へ出す。 */
  attackBox(reach = 11, width = 12): Box {
    switch (this.facing) {
      case 'up': return { x: this.x - width / 2, y: this.y - this.footH - reach, w: width, h: reach };
      case 'down': return { x: this.x - width / 2, y: this.y, w: width, h: reach };
      case 'left': return { x: this.x - this.footW / 2 - reach, y: this.y - this.footH - 3, w: reach, h: width };
      default: return { x: this.x + this.footW / 2, y: this.y - this.footH - 3, w: reach, h: width };
    }
  }

  /** dt 秒ぶんの移動。壁とブロッカーで解決する。 */
  moveBy(dx: number, dy: number, map: TileMap, blockers: readonly Box[] = []): { hitX: boolean; hitY: boolean } {
    const b = this.foot;
    const r = moveBox(b, dx, dy, map, blockers);
    this.x = b.x + this.footW / 2;
    this.y = b.y + this.footH;
    return r;
  }

  /** ノックバック・スタン・無敵の共通更新。派生側の update から呼ぶ。 */
  protected tickCommon(dt: number, map: TileMap, blockers: readonly Box[]): void {
    this.px = this.x;
    this.py = this.y;

    if (this.iframes > 0) this.iframes -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.stun > 0) this.stun -= dt;

    if (this.knockX !== 0 || this.knockY !== 0) {
      this.moveBy(this.knockX * dt, this.knockY * dt, map, blockers);
      this.knockX = approach(this.knockX, 0, 900 * dt);
      this.knockY = approach(this.knockY, 0, 900 * dt);
    }

    this.animator.update(dt);
  }

  /** その場に立っているだけのNPC用。アニメとノックバックだけ回す。 */
  tick(dt: number, map: TileMap, blockers: readonly Box[] = []): void {
    this.tickCommon(dt, map, blockers);
  }

  playState(state: ActorState, restart = false): void {
    this.state = state;
    const key = `${state}:${dir3(this.facing)}`;
    this.animator.play(key, selectAnim(this.set, state, this.facing), restart);
  }

  /** ダメージ。戻り値は実際に入ったか。 */
  hurt(amount: number, fromX: number, fromY: number, knock = 130): boolean {
    if (this.dead || this.iframes > 0) return false;
    this.hp -= amount;
    this.iframes = 0.5;
    this.flashT = 0.16;
    this.stun = 0.24;
    const dx = this.x - fromX;
    const dy = this.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    this.knockX = (dx / len) * knock;
    this.knockY = (dy / len) * knock;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.playState('downed', true);
    } else {
      this.playState('hurt', true);
    }
    return true;
  }

  draw(g: CanvasRenderingContext2D, camX: number, camY: number, showHitbox = false): void {
    const sx = Math.round(this.x - camX);
    const sy = Math.round(this.y - camY);

    if (!this.dead) shadowEllipse(g, sx, sy - 1, this.footW / 2 + 1, 2.2, 0.34);

    const sprite = this.animator.frame;
    const flip = flipFor(this.facing);

    if (this.flashT > 0) {
      sprite.drawSilhouette(g, sx, sy, PAL.WHITE, flip);
    } else if (this.iframes > 0 && Math.floor(this.iframes * 20) % 2 === 0) {
      g.globalAlpha = 0.55;
      sprite.draw(g, sx, sy, flip);
      g.globalAlpha = 1;
    } else {
      sprite.draw(g, sx, sy, flip);
    }

    if (showHitbox) {
      const f = this.foot;
      strokeRect(g, f.x - camX, f.y - camY, f.w, f.h, rgba(PAL.RED_L, 0.9));
      if (this.state === 'attack') {
        const a = this.attackBox();
        strokeRect(g, a.x - camX, a.y - camY, a.w, a.h, rgba(PAL.GOLD_L, 0.9));
      }
    }
  }
}
