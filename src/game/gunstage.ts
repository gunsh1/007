/**
 * 銃撃ステージ（前編）。Hotline Miami 式の見下ろし。
 *
 *  ・マウスで銃口を向け、クリックで撃つ。WASD で移動
 *  ・敵は一発で死ぬ。ボンドは三発
 *  ・弾は有限。死体の銃を [E] で拾う。弾切れの銃は [K] で投げつけて怯ませる
 *  ・銃声は響く。聞いた敵が寄ってくる。消音なら響かない
 *  ・背後から [E] は当て身（非殺傷・無音）。殺さずに抜けることもできる
 *
 * 章側は「マップ・敵の配置・目的」だけ書けばよい。
 */
import type { SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { vignette, scanlines, flash } from '../gfx/ui';
import { anims, dirFromVec, type LookName, type Dir4 } from '../gfx/actors';
import type { TileMap } from '../gfx/tiles';
import { Camera } from './camera';
import { Particles, FloatTexts } from './fx';
import { clamp, dist, lineOfSight, moveBox, type Box } from './physics';
import { GUNS, makeHeld, type Bullet, type GroundGun, type GunId, type Held, type Noise } from './guns';
import { Rng } from '../core/rng';

const PLAYER_SPEED = 96;
const PLAYER_SPRINT = 148;
/** 走ると足音が響く距離 */
const STEP_NOISE = 52;
const SPRINT_NOISE = 92;

const BODY_W = 8;
const BODY_H = 5;

export type GoonState = 'patrol' | 'idle' | 'suspicious' | 'engage' | 'search' | 'down' | 'dead';

export interface GoonDef {
  x: number;
  y: number;
  look: LookName;
  gun: GunId;
  /** 巡回路（無ければその場で立哨） */
  patrol?: { x: number; y: number }[];
  /** 立哨時に向いている角度（ラジアン） */
  facing?: number;
  /** 首を振る幅 */
  sweep?: number;
  name?: string;
}

/** 敵。見つけたら撃ってくる。一発で死ぬ。 */
export class Goon {
  x: number;
  y: number;
  state: GoonState = 'idle';
  look: LookName;
  held: Held;
  name: string;
  /** 視線の向き */
  angle: number;
  /** 立哨の基準角と首振り */
  readonly baseAngle: number;
  readonly sweep: number;
  readonly patrol: { x: number; y: number }[];
  /** 巡回路のどこへ向かっているか */
  leg = 0;
  /** 首振りの位相（同じ動きに揃わないよう個体差をつける） */
  readonly phase: number;
  /** その場を探している時間 */
  searchT = 0;
  /** 次に撃てるまでの間（人間らしい遅れ） */
  reactionT = 0.35;
  /** 気になっている場所 */
  target: { x: number; y: number } | null = null;
  /** 死体・気絶体の向き */
  downAngle = 0;
  /** 当て身で気絶したか（＝殺していない） */
  knockedOut = false;
  /** 投げつけられて怯んでいる残り秒 */
  stun = 0;
  /** 歩行アニメ用 */
  walkT = 0;

  constructor(d: GoonDef) {
    this.x = d.x;
    this.y = d.y;
    this.look = d.look;
    this.held = makeHeld(d.gun);
    this.name = d.name ?? '';
    this.baseAngle = d.facing ?? Math.PI / 2;
    this.angle = this.baseAngle;
    this.sweep = d.sweep ?? 0.6;
    this.patrol = d.patrol ?? [];
    this.phase = (d.x * 0.07 + d.y * 0.11) % 6.28;
    this.state = this.patrol.length > 0 ? 'patrol' : 'idle';
  }

  get hasPatrol(): boolean { return this.patrol.length > 0; }
  get legTarget(): { x: number; y: number } | undefined { return this.patrol[this.leg % this.patrol.length]; }
  nextLeg(): void { this.leg = (this.leg + 1) % Math.max(1, this.patrol.length); }

  get dead(): boolean { return this.state === 'dead' || this.state === 'down'; }
  get alive(): boolean { return !this.dead; }
  get foot(): Box { return { x: this.x - BODY_W / 2, y: this.y - BODY_H, w: BODY_W, h: BODY_H }; }
  get chestY(): number { return this.y - 10; }
  get facing4(): Dir4 { return dirFromVec(Math.cos(this.angle), Math.sin(this.angle), 'down'); }
  /** 警戒しているか（HUD 表示用） */
  get alerted(): boolean { return this.state === 'engage' || this.state === 'search'; }

  /** 視界に入っているか */
  canSee(map: TileMap, px: number, py: number): boolean {
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 132) return false;
    let diff = Math.abs(Math.atan2(dy, dx) - this.angle);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    // 至近距離は背後でも気づく
    if (d > 18 && diff > 0.62) return false;
    return lineOfSight(map, this.x, this.chestY, px, py - 10);
  }

  hear(n: Noise): void {
    if (this.dead) return;
    if (dist(this.x, this.y, n.x, n.y) > n.radius) return;
    if (this.state === 'engage') return;
    this.state = 'search';
    this.target = { x: n.x, y: n.y };
    this.searchT = 0;
  }

  kill(angle: number): void {
    this.state = 'dead';
    this.downAngle = angle;
    this.knockedOut = false;
  }

  subdue(angle: number): void {
    this.state = 'down';
    this.downAngle = angle;
    this.knockedOut = true;
  }
}

export interface GunStageOpts {
  map: TileMap;
  spawnX: number;
  spawnY: number;
  tint?: string;
  tintAlpha?: number;
  vignette?: number;
  /** 白黒で描く（プラハの回想） */
  monochrome?: boolean;
  /** 初期装備 */
  gun?: GunId;
  /** 最大体力（既定3） */
  hp?: number;
}

/** 血だまり・薬莢などの床の痕 */
interface Decal { x: number; y: number; r: number; color: string }

export interface StageStats {
  kills: number;
  knockouts: number;
  shots: number;
  /** 見つかった回数 */
  spotted: number;
  time: number;
}

export class GunStage {
  map: TileMap;
  cam = new Camera();
  particles = new Particles();
  floats = new FloatTexts();
  rng = new Rng(0x9_0007);

  // ── プレイヤー ──
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** 銃口の向き（マウス） */
  aim = 0;
  held: Held | null;
  /** 撃てるようになるまで */
  cool = 0;
  /** 反動で照準がずれている量 */
  recoil = 0;
  walkT = 0;
  facing: Dir4 = 'down';
  iframes = 0;
  dead = false;

  goons: Goon[] = [];
  bullets: Bullet[] = [];
  ground: GroundGun[] = [];
  noises: Noise[] = [];
  decals: Decal[] = [];

  stats: StageStats = { kills: 0, knockouts: 0, shots: 0, spotted: 0, time: 0 };
  hurtFlash = 0;
  hitStop = 0;
  /** 章側が読む「今フレームに起きたこと」 */
  lastEvent: 'kill' | 'subdue' | 'pickup' | 'throw' | 'empty' | 'hurt' | null = null;

  private opts: GunStageOpts;
  private stepAcc = 0;

  constructor(o: GunStageOpts) {
    this.opts = o;
    this.map = o.map;
    this.x = o.spawnX;
    this.y = o.spawnY;
    this.maxHp = o.hp ?? 3;
    this.hp = this.maxHp;
    this.held = o.gun ? makeHeld(o.gun) : null;
    this.cam.setBounds(this.map.pixelWidth, this.map.pixelHeight);
    this.cam.snapTo(this.x, this.y);
  }

  get foot(): Box { return { x: this.x - BODY_W / 2, y: this.y - BODY_H, w: BODY_W, h: BODY_H }; }
  get liveGoons(): Goon[] { return this.goons.filter((g) => g.alive); }
  /** 誰かに見つかっているか */
  get engaged(): boolean { return this.goons.some((g) => g.alive && g.state === 'engage'); }

  spawn(defs: GoonDef[]): void {
    for (const d of defs) this.goons.push(new Goon(d));
  }

  reset(x: number, y: number, gun: GunId | null): void {
    this.x = x;
    this.y = y;
    this.hp = this.maxHp;
    this.dead = false;
    this.held = gun ? makeHeld(gun) : null;
    this.bullets = [];
    this.ground = [];
    this.noises = [];
    this.decals = [];
    this.goons = [];
    this.particles.clear();
    this.floats.clear();
    this.stats = { kills: 0, knockouts: 0, shots: 0, spotted: 0, time: 0 };
    this.cam.snapTo(x, y);
  }

  /** 床に血だまりを残す */
  splatter(x: number, y: number, r = 8): void {
    this.decals.push({ x, y, r, color: rgba(PAL.BLOOD, 0.75) });
  }

  // ── 音 ──

  emitNoise(x: number, y: number, radius: number): void {
    if (radius <= 0) return;
    this.noises.push({ x, y, radius, t: 0.5 });
    for (const g of this.goons) g.hear({ x, y, radius, t: 0 });
  }

  // ── 進行 ──

  update(ctx: SceneCtx, dtRaw: number): void {
    if (this.hitStop > 0) {
      this.hitStop -= dtRaw;
      this.particles.update(dtRaw * 0.3);
      this.cam.follow(this.camTargetX(ctx), this.camTargetY(ctx), dtRaw);
      return;
    }
    const dt = dtRaw;
    this.stats.time += dt;
    this.lastEvent = null;
    if (this.hurtFlash > 0) this.hurtFlash -= dt * 2.4;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.cool > 0) this.cool -= dt;
    this.recoil *= 1 - Math.min(1, 7 * dt);

    for (let i = this.noises.length - 1; i >= 0; i--) {
      const n = this.noises[i]!;
      n.t -= dt;
      if (n.t <= 0) this.noises.splice(i, 1);
    }

    if (!this.dead) {
      this.updateAim(ctx);
      this.updatePlayer(ctx, dt);
    }
    this.updateBullets(ctx, dt);
    this.updateGround(dt);
    for (const g of this.goons) this.updateGoon(ctx, g, dt);

    this.particles.update(dt);
    this.floats.update(dt);
    this.cam.follow(this.camTargetX(ctx), this.camTargetY(ctx), dt);
  }

  /** カメラはプレイヤーとカーソルの間を見る（Hotline Miami の「先が見える」感じ） */
  private camTargetX(ctx: SceneCtx): number {
    const m = ctx.input.mouse;
    if (!m.inside) return this.x;
    const world = m.x + this.cam.drawX;
    return this.x + clamp((world - this.x) * 0.32, -52, 52);
  }

  private camTargetY(ctx: SceneCtx): number {
    const m = ctx.input.mouse;
    if (!m.inside) return this.y - 8;
    const world = m.y + this.cam.drawY;
    return this.y - 8 + clamp((world - this.y) * 0.32, -40, 40);
  }

  private updateAim(ctx: SceneCtx): void {
    const m = ctx.input.mouse;
    if (m.inside) {
      const wx = m.x + this.cam.drawX;
      const wy = m.y + this.cam.drawY;
      this.aim = Math.atan2(wy - (this.y - 8), wx - this.x);
    }
    this.facing = dirFromVec(Math.cos(this.aim), Math.sin(this.aim), this.facing);
  }

  private updatePlayer(ctx: SceneCtx, dt: number): void {
    const inp = ctx.input;
    const ax = inp.axisX();
    const ay = inp.axisY();
    const len = Math.hypot(ax, ay);
    const sprinting = inp.isDown('dodge');

    if (len > 0.05) {
      const spd = sprinting ? PLAYER_SPRINT : PLAYER_SPEED;
      const b = this.foot;
      moveBox(b, (ax / len) * spd * dt, (ay / len) * spd * dt, this.map, this.goonBoxes());
      this.x = b.x + BODY_W / 2;
      this.y = b.y + BODY_H;
      this.walkT += dt;
      this.stepAcc += spd * dt;
      if (this.stepAcc > 16) {
        this.stepAcc = 0;
        ctx.audio.sfx('step', sprinting ? 1.15 : 0.9);
        this.emitNoise(this.x, this.y, sprinting ? SPRINT_NOISE : STEP_NOISE);
      }
    }

    // 撃つ
    const spec = this.held ? GUNS[this.held.id] : GUNS.fist;
    const wantFire = spec.auto ? inp.fireHeld : inp.firePressed;
    if (wantFire && this.cool <= 0) this.fire(ctx);

    // 拾う・当て身
    if (inp.justPressed('interact')) this.interact(ctx);
    // 投げる
    if (inp.justPressed('heavy')) this.throwGun(ctx);
  }

  private goonBoxes(): Box[] {
    return this.goons.filter((g) => g.alive).map((g) => g.foot);
  }

  private fire(ctx: SceneCtx): void {
    const spec = this.held ? GUNS[this.held.id] : GUNS.fist;
    this.cool = spec.cooldown;

    if (spec.melee) {
      // 近接。届く範囲の相手を即殺す。
      const tx = this.x + Math.cos(this.aim) * spec.reach;
      const ty = this.y - 8 + Math.sin(this.aim) * spec.reach;
      const hit = this.liveGoons.find((g) => dist(g.x, g.y - 8, tx, ty) < 12);
      ctx.audio.sfx(hit ? 'punch.heavy' : 'whiff', 1.1);
      if (hit) {
        hit.kill(this.aim);
        this.onKill(ctx, hit, false);
      }
      this.emitNoise(this.x, this.y, spec.noise);
      return;
    }

    if (!this.held || this.held.ammo <= 0) {
      ctx.audio.sfx('click.empty');
      this.lastEvent = 'empty';
      this.cool = 0.3;
      return;
    }

    this.held.ammo--;
    this.stats.shots++;
    const mx = this.x + Math.cos(this.aim) * 8;
    const my = this.y - 8 + Math.sin(this.aim) * 8;
    for (let i = 0; i < spec.pellets; i++) {
      const a = this.aim + this.rng.float(-spec.spread, spec.spread) + this.recoil;
      this.bullets.push({
        x: mx, y: my, px: mx, py: my,
        vx: Math.cos(a) * spec.speed, vy: Math.sin(a) * spec.speed,
        fromHero: true, life: 1.1, color: spec.color,
      });
    }
    this.recoil += this.rng.float(-spec.kick, spec.kick);
    this.particles.hitSpark(mx, my, PAL.GOLD_L);
    this.cam.shake(spec.pellets > 1 ? 3 : 1.4, 0.12);
    ctx.audio.sfx(spec.noise > 100 ? 'gunshot' : 'shell', spec.id === 'shotgun' ? 0.7 : 1.1);
    this.emitNoise(this.x, this.y, spec.noise);
  }

  /** 拾う／当て身 */
  private interact(ctx: SceneCtx): void {
    // 背後の敵に当て身（非殺傷・無音）
    const back = this.liveGoons.find((g) => {
      if (dist(g.x, g.y, this.x, this.y) > 18) return false;
      let diff = Math.abs(Math.atan2(this.y - g.y, this.x - g.x) - g.angle);
      while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
      return diff > 1.1 || g.state !== 'engage';
    });
    if (back) {
      back.subdue(this.aim);
      this.onKill(ctx, back, true);
      return;
    }

    // 落ちている銃を拾う
    let best: GroundGun | null = null;
    let bestD = 15;
    for (const gg of this.ground) {
      const d = dist(gg.x, gg.y, this.x, this.y);
      if (d < bestD) { bestD = d; best = gg; }
    }
    if (!best) return;
    const idx = this.ground.indexOf(best);
    // 今の銃は落とす（素手なら落とさない）
    if (this.held) {
      this.ground.push({
        x: this.x, y: this.y, id: this.held.id, ammo: this.held.ammo,
        vx: 0, vy: 0, spin: this.rng.float(0, 6), t: 0,
      });
    }
    this.held = { id: best.id, ammo: best.ammo };
    this.ground.splice(idx, 1);
    ctx.audio.sfx('pickup');
    this.floats.push(this.x, this.y - 24, GUNS[best.id].name, PAL.GOLD_L, 0.9);
    this.lastEvent = 'pickup';
  }

  /** 銃を投げつける。当たれば怯む。 */
  private throwGun(ctx: SceneCtx): void {
    if (!this.held || GUNS[this.held.id].melee) return;
    this.ground.push({
      x: this.x, y: this.y - 8, id: this.held.id, ammo: this.held.ammo,
      vx: Math.cos(this.aim) * 260, vy: Math.sin(this.aim) * 260,
      spin: 0, t: 0,
    });
    this.held = null;
    ctx.audio.sfx('whiff', 0.8);
    this.lastEvent = 'throw';
  }

  private onKill(ctx: SceneCtx, g: Goon, silent: boolean): void {
    if (silent) {
      this.stats.knockouts++;
      this.lastEvent = 'subdue';
      ctx.audio.sfx('hit', 0.7);
      this.floats.push(g.x, g.y - 26, '当て身', PAL.SILVER, 0.8);
    } else {
      this.stats.kills++;
      this.lastEvent = 'kill';
      this.particles.blood(g.x, g.chestY, Math.cos(g.downAngle), Math.sin(g.downAngle));
      this.decals.push({ x: g.x, y: g.y, r: this.rng.float(5, 9), color: rgba(PAL.BLOOD, 0.75) });
      ctx.audio.sfx('bodyfall');
      this.hitStop = 0.05;
      this.cam.shake(2.5, 0.18);
    }
    // 得物を落とす
    if (!GUNS[g.held.id].melee) {
      this.ground.push({
        x: g.x + this.rng.float(-5, 5), y: g.y + this.rng.float(-3, 3),
        id: g.held.id, ammo: g.held.ammo, vx: 0, vy: 0, spin: this.rng.float(0, 6), t: 0,
      });
    }
  }

  private updateBullets(ctx: SceneCtx, dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]!;
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.life <= 0 || this.map.solidAtPx(b.x, b.y)) {
        this.particles.hitSpark(b.x, b.y, PAL.SILVER);
        this.bullets.splice(i, 1);
        continue;
      }

      if (b.fromHero) {
        const hit = this.liveGoons.find((g) => dist(g.x, g.y - 8, b.x, b.y) < 8);
        if (hit) {
          hit.kill(Math.atan2(b.vy, b.vx));
          this.onKill(ctx, hit, false);
          this.bullets.splice(i, 1);
        }
        continue;
      }

      if (!this.dead && this.iframes <= 0 && dist(this.x, this.y - 8, b.x, b.y) < 7) {
        this.bullets.splice(i, 1);
        this.takeHit(ctx);
      }
    }
  }

  takeHit(ctx: SceneCtx): void {
    if (ctx.debug.invincible) return;
    this.hp--;
    this.iframes = 0.5;
    this.hurtFlash = 1;
    this.hitStop = 0.07;
    this.cam.shake(4, 0.3);
    this.particles.blood(this.x, this.y - 10, 0, -1);
    ctx.audio.sfx('hit');
    this.lastEvent = 'hurt';
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.decals.push({ x: this.x, y: this.y, r: 9, color: rgba(PAL.BLOOD, 0.8) });
      ctx.audio.sfx('bodyfall');
    }
  }

  private updateGround(dt: number): void {
    for (const gg of this.ground) {
      gg.t += dt;
      if (gg.vx === 0 && gg.vy === 0) continue;
      const nx = gg.x + gg.vx * dt;
      const ny = gg.y + gg.vy * dt;
      gg.spin += dt * 18;
      if (this.map.solidAtPx(nx, ny)) { gg.vx = 0; gg.vy = 0; continue; }
      // 投げた銃が敵に当たると怯む
      const hit = this.liveGoons.find((g) => dist(g.x, g.y - 8, nx, ny) < 10);
      if (hit) {
        hit.stun = 1.4;
        hit.state = 'search';
        hit.target = { x: this.x, y: this.y };
        gg.vx = 0;
        gg.vy = 0;
        this.floats.push(hit.x, hit.y - 26, '怯んだ', PAL.GOLD_L, 0.8);
        continue;
      }
      gg.x = nx;
      gg.y = ny;
      gg.vx *= 1 - 2.6 * dt;
      gg.vy *= 1 - 2.6 * dt;
      if (Math.hypot(gg.vx, gg.vy) < 12) { gg.vx = 0; gg.vy = 0; }
    }
  }

  private updateGoon(ctx: SceneCtx, g: Goon, dt: number): void {
    if (g.dead) return;
    if (g.stun > 0) { g.stun -= dt; return; }

    const seen = !this.dead && g.canSee(this.map, this.x, this.y);
    if (seen && g.state !== 'engage') {
      g.state = 'engage';
      g.target = { x: this.x, y: this.y };
      this.stats.spotted++;
      ctx.audio.sfx('ui.error', 1.5);
      this.floats.push(g.x, g.y - 28, '！', PAL.RED_L, 0.7);
      // 見つけた奴は叫ぶ → 近くの仲間も動く
      this.emitNoise(g.x, g.y, 150);
    }

    switch (g.state) {
      case 'idle': {
        // 立哨。首を振る。
        g.angle = g.baseAngle + Math.sin(this.stats.time * 0.9 + g.phase) * g.sweep;
        break;
      }
      case 'patrol': {
        const p = g.legTarget;
        if (!p) break;
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        const d = Math.hypot(dx, dy);
        if (d < 6) { g.nextLeg(); break; }
        g.angle = Math.atan2(dy, dx);
        this.moveGoon(g, (dx / d) * 44 * dt, (dy / d) * 44 * dt);
        g.walkT += dt;
        break;
      }
      case 'search': {
        const p = g.target;
        if (!p) { g.state = g.hasPatrol ? 'patrol' : 'idle'; break; }
        const dx = p.x - g.x;
        const dy = p.y - g.y;
        const d = Math.hypot(dx, dy);
        g.angle = Math.atan2(dy, dx);
        if (d > 10) {
          this.moveGoon(g, (dx / d) * 56 * dt, (dy / d) * 56 * dt);
          g.walkT += dt;
        } else {
          g.searchT += dt;
          g.angle += Math.sin(g.searchT * 3) * 0.05;
          if (g.searchT > 3.4) { g.searchT = 0; g.target = null; g.state = g.hasPatrol ? 'patrol' : 'idle'; }
        }
        break;
      }
      case 'engage': {
        const dx = this.x - g.x;
        const dy = (this.y - 8) - (g.y - 8);
        const d = Math.hypot(dx, dy) || 1;
        g.angle = Math.atan2(dy, dx);
        if (!seen) {
          // 見失った
          g.state = 'search';
          g.target = { x: this.x, y: this.y };
          g.searchT = 0;
          break;
        }
        g.reactionT -= dt;
        const spec = GUNS[g.held.id];
        // 近すぎると殴りにくる、遠いと寄る
        if (spec.melee) {
          if (d > spec.reach) this.moveGoon(g, (dx / d) * 60 * dt, (dy / d) * 60 * dt);
          else if (g.reactionT <= 0) {
            g.reactionT = spec.cooldown + 0.3;
            if (this.iframes <= 0) this.takeHit(ctx);
          }
          g.walkT += dt;
          break;
        }
        if (d > 120) this.moveGoon(g, (dx / d) * 46 * dt, (dy / d) * 46 * dt);
        else if (d < 40) this.moveGoon(g, -(dx / d) * 34 * dt, -(dy / d) * 34 * dt);
        if (g.reactionT <= 0 && g.held.ammo > 0) {
          g.reactionT = spec.cooldown + 0.42;
          g.held.ammo--;
          const a = g.angle + this.rng.float(-spec.spread - 0.06, spec.spread + 0.06);
          this.bullets.push({
            x: g.x + Math.cos(a) * 8, y: g.y - 8 + Math.sin(a) * 8,
            px: g.x, py: g.y - 8,
            vx: Math.cos(a) * spec.speed * 0.82, vy: Math.sin(a) * spec.speed * 0.82,
            fromHero: false, life: 1.2, color: PAL.RED_L,
          });
          ctx.audio.sfx('gunshot', 0.85);
          this.emitNoise(g.x, g.y, spec.noise);
        }
        break;
      }
      default:
        break;
    }
  }

  private moveGoon(g: Goon, dx: number, dy: number): void {
    const b = g.foot;
    const others = this.goons.filter((o) => o !== g && o.alive).map((o) => o.foot);
    moveBox(b, dx, dy, this.map, others);
    g.x = b.x + BODY_W / 2;
    g.y = b.y + BODY_H;
  }

  // ── 描画 ──

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const cx = this.cam.drawX;
    const cy = this.cam.drawY;

    g.fillStyle = PAL.VOID;
    g.fillRect(0, 0, GAME_W, GAME_H);
    this.map.draw(g, cx, cy, GAME_W, GAME_H, false);

    // 床の痕
    for (const d of this.decals) {
      g.fillStyle = d.color;
      g.beginPath();
      g.ellipse(d.x - cx, d.y - cy, d.r, d.r * 0.5, 0, 0, Math.PI * 2);
      g.fill();
    }

    // 落ちている銃
    for (const gg of this.ground) this.drawGroundGun(g, gg, cx, cy);

    // 視界
    for (const goon of this.liveGoons) this.drawCone(g, goon, cx, cy, ctx.time);

    // 音の輪
    for (const n of this.noises) {
      const a = Math.max(0, n.t / 0.5);
      g.strokeStyle = rgba(PAL.SILVER, a * 0.28);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(n.x - cx, n.y - cy, n.radius * (1 - a) * 0.9 + 6, 0, Math.PI * 2);
      g.stroke();
    }

    // 死体 → 生きている者 → プレイヤー の順（Yソート）
    const drawList: { y: number; back: boolean; run: () => void }[] = [];
    for (const goon of this.goons) {
      drawList.push({
        y: goon.y, back: goon.dead,
        run: () => this.drawGoon(g, goon, cx, cy),
      });
    }
    if (!this.dead) drawList.push({ y: this.y, back: false, run: () => this.drawPlayer(g, cx, cy) });
    else drawList.push({ y: this.y, back: true, run: () => this.drawPlayer(g, cx, cy) });
    drawList.sort((a, b) => (a.back === b.back ? a.y - b.y : a.back ? -1 : 1));
    for (const d of drawList) d.run();

    // 弾
    for (const b of this.bullets) {
      g.strokeStyle = b.color;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(b.px - cx, b.py - cy);
      g.lineTo(b.x - cx, b.y - cy);
      g.stroke();
    }

    this.particles.draw(g, cx, cy);
    this.map.draw(g, cx, cy, GAME_W, GAME_H, true);

    if (this.opts.tint) {
      g.fillStyle = rgba(this.opts.tint, this.opts.tintAlpha ?? 0.2);
      g.fillRect(0, 0, GAME_W, GAME_H);
    }
    vignette(g, this.opts.vignette ?? 0.6);
    if (this.hurtFlash > 0) flash(g, this.hurtFlash * 0.5);
    scanlines(g, 0.05);

    // 照準
    this.drawCrosshair(ctx, g);

    // 浮き文字
    const ui = ctx.display.ui;
    for (const f of this.floats.list) {
      if (!f.text) continue;
      drawText(ui, f.text, f.x - cx, f.y - cy, {
        size: 8, color: f.color, align: 'center', bold: true, outline: true,
        alpha: Math.min(1, f.t / (f.life * 0.5)),
      });
    }
  }

  private drawCone(g: CanvasRenderingContext2D, goon: Goon, cx: number, cy: number, _time: number): void {
    const x = goon.x - cx;
    const y = goon.y - cy - 8;
    if (x < -140 || x > GAME_W + 140) return;
    const engaged = goon.state === 'engage';
    const searching = goon.state === 'search';
    g.save();
    g.beginPath();
    g.moveTo(x, y);
    g.arc(x, y, 132, goon.angle - 0.62, goon.angle + 0.62);
    g.closePath();
    g.fillStyle = rgba(engaged ? PAL.RED_L : searching ? PAL.AMBER : PAL.GOLD_L, engaged ? 0.22 : searching ? 0.15 : 0.10);
    g.fill();
    // 縁を薄く引くと、どこまで見えているかが読める
    g.strokeStyle = rgba(engaged ? PAL.RED_L : searching ? PAL.AMBER : PAL.GOLD, engaged ? 0.4 : 0.16);
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }

  private drawGoon(g: CanvasRenderingContext2D, goon: Goon, cx: number, cy: number): void {
    const x = Math.round(goon.x - cx);
    const y = Math.round(goon.y - cy);
    if (x < -30 || x > GAME_W + 30) return;
    const a = anims(goon.look);

    if (goon.dead) {
      g.save();
      g.globalAlpha = goon.knockedOut ? 0.75 : 1;
      a.downed.frames[0]!.draw(g, x, y, Math.cos(goon.downAngle) < 0);
      g.restore();
      return;
    }

    const moving = goon.state === 'patrol' || goon.state === 'search';
    const set = moving ? a.walk : a.idle;
    const d = goon.facing4;
    const dirSet = d === 'up' ? set.up : d === 'down' ? set.down : set.side;
    const frame = dirSet.frames[Math.floor(goon.walkT * 7) % dirSet.frames.length]!;
    frame.draw(g, x, y, d === 'left');

    if (goon.state === 'engage') {
      g.fillStyle = PAL.RED_L;
      g.fillRect(x - 1, y - 30, 2, 6);
    } else if (goon.state === 'search') {
      g.fillStyle = PAL.AMBER;
      g.fillRect(x - 1, y - 30, 2, 4);
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D, cx: number, cy: number): void {
    const x = Math.round(this.x - cx);
    const y = Math.round(this.y - cy);
    const a = anims('bondSuit');
    if (this.dead) { a.downed.frames[0]!.draw(g, x, y); return; }

    // 足元の輪。混戦でも自分を見失わないように。
    g.strokeStyle = rgba(PAL.GOLD_L, 0.5);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y, 7, 3, 0, 0, Math.PI * 2);
    g.stroke();
    const moving = this.walkT > 0;
    const set = moving ? a.walk : a.idle;
    const d = this.facing;
    const dirSet = d === 'up' ? set.up : d === 'down' ? set.down : set.side;
    const frame = dirSet.frames[Math.floor(this.walkT * 8) % dirSet.frames.length]!;
    if (this.iframes > 0 && Math.floor(this.iframes * 22) % 2 === 0) {
      frame.drawSilhouette(g, x, y, PAL.WHITE, d === 'left');
    } else {
      frame.draw(g, x, y, d === 'left');
    }

    // 銃口
    const spec = this.held ? GUNS[this.held.id] : GUNS.fist;
    if (!spec.melee) {
      const gx = x + Math.cos(this.aim) * 9;
      const gy = y - 8 + Math.sin(this.aim) * 9;
      g.fillStyle = PAL.CHARCOAL;
      g.fillRect(Math.round(gx) - 1, Math.round(gy) - 1, 3, 2);
    }
  }

  private drawGroundGun(g: CanvasRenderingContext2D, gg: GroundGun, cx: number, cy: number): void {
    const x = Math.round(gg.x - cx);
    const y = Math.round(gg.y - cy);
    const spec = GUNS[gg.id];
    g.save();
    g.translate(x, y);
    g.rotate(gg.spin);
    g.fillStyle = rgba(PAL.VOID, 0.35);
    g.fillRect(-5, 2, 10, 2);
    g.fillStyle = spec.id === 'shotgun' || spec.id === 'rifle' ? PAL.BROWN : PAL.CHARCOAL;
    g.fillRect(-5, -1, 10, 3);
    g.fillStyle = PAL.STEEL;
    g.fillRect(1, -1, 4, 1);
    g.restore();
    // 拾える合図
    const pulse = 0.5 + 0.5 * Math.sin(gg.t * 4);
    g.strokeStyle = rgba(PAL.GOLD_L, 0.18 + pulse * 0.22);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y + 1, 9, 4, 0, 0, Math.PI * 2);
    g.stroke();
  }

  private drawCrosshair(ctx: SceneCtx, g: CanvasRenderingContext2D): void {
    const m = ctx.input.mouse;
    if (!m.inside) return;
    const x = Math.round(m.x);
    const y = Math.round(m.y);
    const spec = this.held ? GUNS[this.held.id] : GUNS.fist;
    const col = spec.melee ? PAL.SILVER : this.held && this.held.ammo <= 0 ? PAL.RED_L : PAL.GOLD_L;

    // 銃口からカーソルへの薄い線（構えている感じ）
    if (!spec.melee) {
      const sx = this.x - this.cam.drawX;
      const sy = this.y - this.cam.drawY - 8;
      g.strokeStyle = rgba(col, 0.16);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(x, y);
      g.stroke();
    }

    g.strokeStyle = col;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(x + 0.5, y + 0.5, 4, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = col;
    g.fillRect(x, y - 7, 1, 3);
    g.fillRect(x, y + 5, 1, 3);
    g.fillRect(x - 7, y, 3, 1);
    g.fillRect(x + 5, y, 3, 1);
  }
}

