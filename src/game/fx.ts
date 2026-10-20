/** 打撃の火花・血しぶき・薬莢など、1px の粒だけで作る簡易エフェクト。 */
import { PAL, rgba } from '../gfx/palette';
import { fxRng } from '../core/rng';

interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number; gravity: number;
}

export class Particles {
  private list: P[] = [];

  clear(): void { this.list = []; }
  get count(): number { return this.list.length; }

  spawn(x: number, y: number, vx: number, vy: number, life: number, color: string, size = 1, gravity = 0): void {
    if (this.list.length > 400) return;
    this.list.push({ x, y, vx, vy, life, maxLife: life, color, size, gravity });
  }

  /** 打撃の火花 */
  hitSpark(x: number, y: number, color: string = PAL.WHITE): void {
    for (let i = 0; i < 8; i++) {
      const a = fxRng.float(0, Math.PI * 2);
      const s = fxRng.float(40, 130);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, fxRng.float(0.12, 0.26), color, 1, 90);
    }
  }

  /** 血しぶき */
  blood(x: number, y: number, dirX: number, dirY: number): void {
    for (let i = 0; i < 10; i++) {
      const a = Math.atan2(dirY, dirX) + fxRng.float(-0.8, 0.8);
      const s = fxRng.float(30, 140);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, fxRng.float(0.2, 0.5),
        fxRng.chance(0.4) ? PAL.RED : PAL.BLOOD, 1, 220);
    }
  }

  /** 銃口の閃光 */
  muzzle(x: number, y: number, dirX: number, dirY: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.atan2(dirY, dirX) + fxRng.float(-0.25, 0.25);
      const s = fxRng.float(90, 220);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, fxRng.float(0.05, 0.12), PAL.GOLD_L, 1, 0);
    }
  }

  /** 埃・破片 */
  dust(x: number, y: number, n = 6, color: string = PAL.SILVER): void {
    for (let i = 0; i < n; i++) {
      const a = fxRng.float(0, Math.PI * 2);
      const s = fxRng.float(10, 50);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, fxRng.float(0.3, 0.7), color, 1, -20);
    }
  }

  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt;
    }
  }

  draw(g: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const p of this.list) {
      const a = Math.min(1, p.life / (p.maxLife * 0.6));
      g.fillStyle = a >= 0.99 ? p.color : rgba(p.color, a);
      g.fillRect(Math.round(p.x - camX), Math.round(p.y - camY), p.size, p.size);
    }
  }
}

/** 画面に浮かぶ短いテキスト（ダメージ・「カウンター！」など） */
export interface FloatText { x: number; y: number; text: string; color: string; t: number; life: number }

export class FloatTexts {
  list: FloatText[] = [];
  push(x: number, y: number, text: string, color: string = PAL.WHITE, life = 0.9): void {
    this.list.push({ x, y, text, color, t: life, life });
  }
  update(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i]!;
      f.t -= dt;
      f.y -= 22 * dt;
      if (f.t <= 0) this.list.splice(i, 1);
    }
  }
  clear(): void { this.list = []; }
}
