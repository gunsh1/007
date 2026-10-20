/**
 * 忍び寄り。第6章「ル・シッフルを刺す」ための短いステルス。
 *
 *  ・護衛の視界（扇）に入ったまま数秒いると気づかれる
 *  ・柱の影に入れば見つからない
 *  ・走ると速いが足音が出る。歩けば静かだが遅い
 *  ・[C] で息を止めると足音が完全に消える（肺を食う）
 *  ・目標に触れれば成功
 *
 * 見下ろしの一枚絵で完結する。マップもタイルも使わない。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawBar, fade, vignette, scanlines } from '../gfx/ui';
import { drawBreath, drawHint, drawKeys } from '../gfx/minigame-hud';
import { anims } from '../gfx/actors';
import { Breath } from '../game/breath';
import { assist, recordFail, clearFails } from '../game/assist';
import { Particles } from '../game/fx';
import { clamp } from '../game/physics';

interface Guard {
  x: number;
  y: number;
  /** 視線の中心角（ラジアン） */
  base: number;
  /** 首を振る幅 */
  sweep: number;
  /** 周期（秒） */
  period: number;
  /** 位相 */
  phase: number;
  range: number;
  /** 半頂角 */
  half: number;
}

interface Pillar { x: number; y: number; r: number }

const START = { x: GAME_W / 2, y: GAME_H - 30 };
const TARGET = { x: GAME_W / 2 + 6, y: 44 };

const GUARDS: Guard[] = [
  { x: 74, y: 118, base: 0.15, sweep: 0.75, period: 4.2, phase: 0, range: 96, half: 0.42 },
  { x: 306, y: 104, base: Math.PI - 0.15, sweep: 0.8, period: 5.0, phase: 1.6, range: 96, half: 0.42 },
  { x: 192, y: 74, base: Math.PI / 2, sweep: 0.55, period: 3.4, phase: 0.8, range: 84, half: 0.5 },
];

const PILLARS: Pillar[] = [
  { x: 126, y: 132, r: 15 },
  { x: 258, y: 132, r: 15 },
  { x: 108, y: 82, r: 13 },
  { x: 276, y: 82, r: 13 },
  { x: 192, y: 118, r: 12 },
];

const WALK = 42;
const RUN = 84;
/** 見られ続けて気づかれるまで */
const SPOT_TIME = 1.1;

export interface ApproachOpts {
  title: string;
  hintText?: string | null;
  onDone: (success: boolean, ctx: SceneCtx) => void;
}

const FAIL_ID = 'ch06-approach';

export class ApproachScene implements Scene {
  readonly name = 'approach';

  private x = START.x;
  private y = START.y;
  private facing: 'up' | 'down' | 'left' | 'right' = 'up';
  private t = 0;
  private exposure = 0;
  private breath = new Breath(0.30, 0.24, 1.3);
  private particles = new Particles();
  private noise = 0;
  private caught = 0;
  private done = false;
  private stepAcc = 0;
  private walkT = 0;

  constructor(private o: ApproachOpts) {}

  onEnter(ctx: SceneCtx): void {
    ctx.audio.music('tension');
  }

  /** 柱の影にいるか */
  private hidden(): boolean {
    for (const p of PILLARS) {
      if (Math.hypot(this.x - p.x, this.y - p.y) < p.r + 5) return true;
    }
    return false;
  }

  private gazeAngle(g: Guard): number {
    return g.base + Math.sin((this.t + g.phase) * (Math.PI * 2) / g.period) * g.sweep;
  }

  /** その護衛に見えているか */
  private seenBy(g: Guard): boolean {
    const dx = this.x - g.x;
    const dy = this.y - g.y;
    const d = Math.hypot(dx, dy);
    // 足音を立てていれば、視界の外でも近ければ気づかれる
    if (this.noise > 0.5 && d < 54) return true;
    if (d > g.range) return false;
    if (this.hidden()) return false;
    const a = Math.atan2(dy, dx);
    let diff = Math.abs(a - this.gazeAngle(g));
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    return diff < g.half;
  }

  update(ctx: SceneCtx, dt: number): void {
    if (this.done) return;
    this.t += dt;
    this.particles.update(dt);
    if (this.caught > 0) {
      this.caught -= dt;
      if (this.caught <= 0) this.reset();
      return;
    }

    const holding = this.breath.update(dt, ctx.input.isDown('steady'));

    // 移動。Shift で走る。
    const ax = ctx.input.axisX();
    const ay = ctx.input.axisY();
    const running = ctx.input.isDown('dodge');
    const len = Math.hypot(ax, ay);
    this.noise = 0;
    if (len > 0.05) {
      const spd = running ? RUN : WALK;
      this.x = clamp(this.x + (ax / len) * spd * dt, 14, GAME_W - 14);
      this.y = clamp(this.y + (ay / len) * spd * dt, 30, GAME_H - 22);
      this.facing = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
      this.walkT += dt;
      // 息を止めていれば足音は出ない
      this.noise = holding ? 0 : running ? 1 : 0.25;
      this.stepAcc += spd * dt;
      if (this.stepAcc > (running ? 15 : 20)) {
        this.stepAcc = 0;
        if (!holding) ctx.audio.sfx('step', running ? 1.1 : 0.85);
      }
    }

    // 見られているか
    let seen = false;
    for (const g of GUARDS) if (this.seenBy(g)) { seen = true; break; }

    const limit = SPOT_TIME * (1 + assist(FAIL_ID));
    if (seen) {
      this.exposure += dt;
      if (Math.floor(this.exposure * 6) !== Math.floor((this.exposure - dt) * 6)) ctx.audio.sfx('tick', 1.5);
      if (this.exposure >= limit) { this.spotted(ctx); return; }
    } else {
      this.exposure = Math.max(0, this.exposure - dt * 1.4);
    }

    // 到達
    if (Math.hypot(this.x - TARGET.x, this.y - TARGET.y) < 18) {
      this.done = true;
      clearFails(FAIL_ID);
      ctx.audio.sfx('sting');
      ctx.scenes.pop();
      this.o.onDone(true, ctx);
    }
  }

  private spotted(ctx: SceneCtx): void {
    recordFail(FAIL_ID);
    this.caught = 1.3;
    this.exposure = 0;
    ctx.audio.sfx('ui.error');
    this.particles.dust(this.x, this.y, 10, PAL.RED);
  }

  private reset(): void {
    this.x = START.x;
    this.y = START.y;
    this.breath.reset();
    this.exposure = 0;
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    // 床
    g.fillStyle = '#170a10';
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle = PAL.BLOOD;
    g.fillRect(0, 30, GAME_W, GAME_H - 30);
    g.fillStyle = '#7d1620';
    for (let y = 34; y < GAME_H; y += 6) {
      for (let x = (y % 12 === 0 ? 0 : 3); x < GAME_W; x += 6) g.fillRect(x, y, 1, 1);
    }
    // 奥の壁
    g.fillStyle = '#2a1119';
    g.fillRect(0, 0, GAME_W, 30);
    g.fillStyle = PAL.GOLD;
    g.fillRect(0, 29, GAME_W, 1);

    // 視界
    for (const gd of GUARDS) {
      const a = this.gazeAngle(gd);
      const lit = this.seenBy(gd);
      g.save();
      g.beginPath();
      g.moveTo(gd.x, gd.y);
      g.arc(gd.x, gd.y, gd.range, a - gd.half, a + gd.half);
      g.closePath();
      g.fillStyle = rgba(lit ? PAL.RED_L : PAL.GOLD_L, lit ? 0.20 : 0.08);
      g.fill();
      g.strokeStyle = rgba(lit ? PAL.RED_L : PAL.GOLD, lit ? 0.6 : 0.22);
      g.lineWidth = 1;
      g.stroke();
      g.restore();
    }

    // 柱
    for (const p of PILLARS) {
      g.fillStyle = PAL.VOID;
      g.beginPath();
      g.ellipse(p.x, p.y + 3, p.r, p.r * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = PAL.SLATE;
      g.fillRect(p.x - p.r + 2, p.y - 26, p.r * 2 - 4, 30);
      g.fillStyle = PAL.STEEL;
      g.fillRect(p.x - p.r + 2, p.y - 26, 2, 30);
      g.fillStyle = PAL.GOLD;
      g.fillRect(p.x - p.r + 2, p.y - 26, p.r * 2 - 4, 1);
      g.fillRect(p.x - p.r + 2, p.y + 2, p.r * 2 - 4, 1);
    }

    // 護衛
    for (const gd of GUARDS) {
      anims('thug').idle.down.frames[0]!.draw(g, Math.round(gd.x), Math.round(gd.y));
    }

    // 目標（ル・シッフル）
    anims('chiffre').idle.down.frames[0]!.draw(g, Math.round(TARGET.x), Math.round(TARGET.y));
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
    g.strokeStyle = rgba(PAL.GOLD_L, 0.35 + pulse * 0.4);
    g.setLineDash([3, 3]);
    g.beginPath();
    g.ellipse(TARGET.x, TARGET.y, 18, 9, 0, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);

    // ボンド
    const bond = anims('bondSuit');
    const walking = this.walkT > 0 && Math.hypot(ctx.input.axisX(), ctx.input.axisY()) > 0.05;
    const set = walking ? bond.walk : bond.idle;
    const dirSet = this.facing === 'up' ? set.up : this.facing === 'down' ? set.down : set.side;
    const frame = dirSet.frames[Math.floor(this.walkT * 8) % dirSet.frames.length]!;
    frame.draw(g, Math.round(this.x), Math.round(this.y), this.facing === 'left');

    // 足音の輪
    if (this.noise > 0.5) {
      const r = 54 * (0.6 + 0.4 * Math.sin(this.t * 9));
      g.strokeStyle = rgba(PAL.RED_L, 0.25);
      g.beginPath();
      g.ellipse(this.x, this.y, r, r * 0.4, 0, 0, Math.PI * 2);
      g.stroke();
    }

    this.particles.draw(g, 0, 0);
    vignette(g, 0.7);
    scanlines(g, 0.05);

    // HUD
    drawText(ui, this.o.title, GAME_W / 2, 6, {
      size: 8, color: PAL.GOLD_L, align: 'center', bold: true, outline: true,
    });
    drawText(ui, this.hidden() ? '柱の影' : this.noise > 0.5 ? '足音が響いている' : '', GAME_W / 2, 18, {
      size: 7, color: this.hidden() ? PAL.GOLD_L : PAL.RED_L, align: 'center', outline: true,
    });

    if (this.exposure > 0) {
      drawBar(g, GAME_W / 2 - 40, GAME_H - 40, 80, 4,
        this.exposure / (SPOT_TIME * (1 + assist(FAIL_ID))), PAL.RED_L, PAL.CHARCOAL);
      drawText(ui, '見られている', GAME_W / 2, GAME_H - 50, {
        size: 7, color: PAL.RED_L, align: 'center', outline: true,
      });
    }

    drawBreath(g, ui, this.breath, this.t);
    drawHint(ui, this.o.hintText ?? null);
    drawKeys(ui, 'WASD 歩く / Shift 走る（足音）/ C 息を止める（足音が消える）');

    if (this.caught > 0) {
      fade(g, 0.5 * Math.min(1, this.caught));
      drawText(ui, '見つかった', GAME_W / 2, GAME_H / 2, {
        size: 14, color: PAL.RED_L, align: 'center', bold: true, outline: true,
      });
    }
  }
}
