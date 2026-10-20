/**
 * 除細動器の配線（第7章）。原作 L.95「線が抜けていたため起動しません」。
 *
 *  抜けた線の端をカーソルで掴み、盤面の端子まで運んで差す。
 *  手は震えていて、カーソルは勝手にぶれる。ぶれ幅は心拍に比例する
 *  — つまり、駐車場まで走ってきたぶんだけ、ここが難しくなる。
 *  [C] で息を止めている間だけ震えが止まる（肺は減り、心拍はむしろ上がる）。
 *
 *  線は3本。順番に繋ぐ。1本繋ぐごとに心拍が上がり、震えが増す。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawPanel, drawBar, fade, vignette, scanlines } from '../gfx/ui';
import { drawBreath, drawHint, drawKeys } from '../gfx/minigame-hud';
import { Breath } from '../game/breath';
import { assist, recordFail, clearFails } from '../game/assist';
import { Rng } from '../core/rng';
import { clamp } from '../game/physics';

interface Wire {
  label: string;
  color: string;
  /** 線の根本 */
  from: { x: number; y: number };
  /** 差し込む端子 */
  to: { x: number; y: number };
}

const WIRES: Wire[] = [
  { label: '赤（＋）', color: PAL.RED_L, from: { x: 58, y: 152 }, to: { x: 258, y: 102 } },
  { label: '黒（−）', color: PAL.SLATE, from: { x: 58, y: 172 }, to: { x: 258, y: 124 } },
  { label: '白（信号）', color: PAL.WHITE, from: { x: 58, y: 192 }, to: { x: 258, y: 146 } },
];

/** 端子の当たり半径 */
const PORT_R = 9;
/** カーソルの移動速度 */
const CURSOR_SPEED = 74;
/** 制限時間の基準 */
const BASE_TIME = 46;

const FAIL_ID = 'ch07-wiring';

export interface WiringOpts {
  /** 到着時の心拍 0..1。高いほど震える。 */
  pulse: number;
  hintText?: string | null;
  onDone: (success: boolean, ctx: SceneCtx) => void;
}

export class WiringScene implements Scene {
  readonly name = 'wiring';

  private cx = 90;
  private cy = 160;
  private holding = -1;
  private wired: boolean[] = [false, false, false];
  private t = 0;
  private left = BASE_TIME;
  private breath = new Breath(0.5, 0.22, 1.6);
  private rng = new Rng(0x77_1a_e5);
  private shakeX = 0;
  private shakeY = 0;
  private pulse: number;
  private heartAcc = 0;
  private flash = 0;
  private done = false;
  /** [R] MI6への無線。一度だけ、次に繋ぐ線を教えてもらえる。 */
  private radioLeft = 1;
  private radioT = 0;

  constructor(private o: WiringOpts) {
    this.pulse = clamp(o.pulse, 0.15, 1);
  }

  onEnter(ctx: SceneCtx): void {
    ctx.audio.music('dread');
    this.left = BASE_TIME * (1 + assist(FAIL_ID));
  }

  /** 震えの大きさ（px） */
  private get tremor(): number {
    if (this.breath.held) return 0;
    return 0.6 + this.pulse * 3.4 + this.wired.filter(Boolean).length * 0.5;
  }

  update(ctx: SceneCtx, dt: number): void {
    if (this.done) return;
    this.t += dt;
    if (this.flash > 0) this.flash -= dt * 2;
    this.left -= dt;

    // 息を止めると震えは止まるが、心拍は上がっていく
    const held = this.breath.update(dt, ctx.input.isDown('steady'));
    this.pulse = clamp(this.pulse + (held ? 0.055 : -0.02) * dt, 0.15, 1);

    // [R] MI6への無線。次に繋ぐ線を教えてもらう（一度きり）。
    if (this.radioT > 0) this.radioT -= dt;
    if (ctx.input.justPressed('gadget') && this.radioLeft > 0) {
      this.radioLeft--;
      this.radioT = 6;
      ctx.audio.sfx('ui.confirm', 0.8);
    }

    // 心音
    this.heartAcc += dt * (1 + this.pulse * 1.5);
    if (this.heartAcc > 1.1) {
      this.heartAcc = 0;
      ctx.audio.sfx('heartbeat', 0.9 + this.pulse * 0.3);
    }

    // 震え（低周波のゆらぎ＋鼓動に合わせた跳ね）
    const tr = this.tremor;
    const beat = Math.max(0, Math.sin(this.heartAcc * 7)) * tr * 0.8;
    this.shakeX = Math.sin(this.t * 11.3) * tr + this.rng.float(-tr, tr) * 0.35 + beat * 0.4;
    this.shakeY = Math.cos(this.t * 9.7) * tr + this.rng.float(-tr, tr) * 0.35 - beat * 0.4;

    // カーソル
    const ax = ctx.input.axisX();
    const ay = ctx.input.axisY();
    const len = Math.hypot(ax, ay);
    if (len > 0.05) {
      this.cx += (ax / len) * CURSOR_SPEED * dt;
      this.cy += (ay / len) * CURSOR_SPEED * dt;
    }
    this.cx = clamp(this.cx, 20, GAME_W - 20);
    this.cy = clamp(this.cy, 44, GAME_H - 30);

    const px = this.cx + this.shakeX;
    const py = this.cy + this.shakeY;

    // 掴む・離す
    if (ctx.input.justPressed('light')) {
      if (this.holding >= 0) {
        // 端子に届いていれば差さる
        const w = WIRES[this.holding]!;
        if (Math.hypot(px - w.to.x, py - w.to.y) < PORT_R) {
          this.wired[this.holding] = true;
          this.holding = -1;
          this.flash = 1;
          ctx.audio.sfx('ui.confirm');
          this.pulse = clamp(this.pulse + 0.06, 0.15, 1);
          if (this.wired.every(Boolean)) { this.finish(ctx, true); return; }
        } else {
          this.holding = -1;
          ctx.audio.sfx('ui.cancel');
        }
      } else {
        for (let i = 0; i < WIRES.length; i++) {
          if (this.wired[i]) continue;
          const w = WIRES[i]!;
          if (Math.hypot(px - w.from.x, py - w.from.y) < PORT_R + 3) {
            this.holding = i;
            ctx.audio.sfx('tick', 1.3);
            break;
          }
        }
      }
    }

    if (this.left <= 0) this.finish(ctx, false);
  }

  private finish(ctx: SceneCtx, ok: boolean): void {
    this.done = true;
    if (ok) clearFails(FAIL_ID); else recordFail(FAIL_ID);
    ctx.scenes.pop();
    this.o.onDone(ok, ctx);
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    g.fillStyle = PAL.VOID;
    g.fillRect(0, 0, GAME_W, GAME_H);

    // 車内。ダッシュボードの陰。
    g.fillStyle = '#141821';
    g.fillRect(0, 34, GAME_W, GAME_H - 34);
    g.fillStyle = '#1c2230';
    g.fillRect(0, 34, GAME_W, 3);

    // 除細動器の本体
    drawPanel(g, 232, 56, 96, 100, { fill: '#c9c2b4', border: PAL.STEEL, accent: PAL.SILVER });
    g.fillStyle = '#2a2f3a';
    g.fillRect(240, 62, 80, 26);
    // 心電図
    g.strokeStyle = this.wired.every(Boolean) ? PAL.GREEN_OK : PAL.STEEL;
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < 76; i++) {
      const x = 242 + i;
      const phase = (i / 76 + this.t * 0.5) % 1;
      const spike = phase > 0.45 && phase < 0.52 ? -8 : phase > 0.52 && phase < 0.57 ? 5 : 0;
      const y = 76 + spike * (this.wired.every(Boolean) ? 1 : 0.15);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();

    // 無線で教わっている「次の一本」
    const nextIdx = this.wired.findIndex((v) => !v);

    // 端子
    for (let i = 0; i < WIRES.length; i++) {
      const w = WIRES[i]!;
      const on = this.wired[i]!;
      // 無線中は、繋ぐべき線と端子が光る
      if (this.radioT > 0 && i === nextIdx) {
        const p = 0.5 + 0.5 * Math.sin(this.t * 6);
        g.strokeStyle = rgba(PAL.GREEN_OK, 0.4 + p * 0.5);
        g.lineWidth = 1;
        g.beginPath();
        g.arc(w.to.x, w.to.y, 13, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(w.from.x, w.from.y, 9, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = on ? w.color : PAL.INK;
      g.beginPath();
      g.arc(w.to.x, w.to.y, 5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = on ? PAL.GOLD_L : rgba(PAL.SILVER, 0.6);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(w.to.x, w.to.y, 6.5, 0, Math.PI * 2);
      g.stroke();
      // 端子の名前
      drawText(ui, w.label, w.to.x + 12, w.to.y - 4, {
        size: 6, color: on ? PAL.GREEN_OK : rgba(PAL.INK, 0.9),
      });
      // 掴んでいる線の行き先を点滅で示す
      if (this.holding === i) {
        const p = 0.5 + 0.5 * Math.sin(this.t * 8);
        g.strokeStyle = rgba(PAL.GOLD_L, 0.4 + p * 0.5);
        g.setLineDash([2, 3]);
        g.beginPath();
        g.arc(w.to.x, w.to.y, 11, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
    }

    // 胸のパッド側（線の根本）
    g.fillStyle = '#2a1a1a';
    g.fillRect(38, 140, 40, 70);
    g.fillStyle = PAL.SKIN_D;
    g.fillRect(40, 142, 36, 66);

    const px = this.cx + this.shakeX;
    const py = this.cy + this.shakeY;

    // 線
    for (let i = 0; i < WIRES.length; i++) {
      const w = WIRES[i]!;
      const end = this.wired[i] ? w.to : this.holding === i ? { x: px, y: py } : { x: w.from.x + 26, y: w.from.y + 8 };
      g.strokeStyle = w.color;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(w.from.x, w.from.y);
      const mx = (w.from.x + end.x) / 2;
      const my = Math.max(w.from.y, end.y) + 14;
      g.quadraticCurveTo(mx, my, end.x, end.y);
      g.stroke();
      // 根本
      g.fillStyle = w.color;
      g.beginPath();
      g.arc(w.from.x, w.from.y, 3.5, 0, Math.PI * 2);
      g.fill();
    }

    // カーソル
    g.strokeStyle = this.holding >= 0 ? PAL.GOLD_L : PAL.WHITE;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(px, py, 5, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = this.holding >= 0 ? PAL.GOLD_L : PAL.WHITE;
    g.fillRect(px - 1, py - 1, 2, 2);

    vignette(g, 0.68);
    if (this.flash > 0) {
      g.fillStyle = rgba(PAL.GREEN_OK, this.flash * 0.16);
      g.fillRect(0, 0, GAME_W, GAME_H);
    }
    scanlines(g, 0.06);

    // HUD
    drawText(ui, '除細動器 — 抜けた線を差し直せ', GAME_W / 2, 5, {
      size: 8, color: PAL.GOLD_L, align: 'center', bold: true, outline: true,
    });
    for (let i = 0; i < WIRES.length; i++) {
      drawText(ui, `${this.wired[i] ? '✔' : '　'} ${WIRES[i]!.label}`, 8, 44 + i * 10, {
        size: 7, color: this.wired[i] ? PAL.GREEN_OK : rgba(PAL.SILVER, 0.8), outline: true,
      });
    }

    drawText(ui, '心拍', GAME_W - 66, 44, { size: 6, color: PAL.RED_L, align: 'left', outline: true });
    drawBar(g, GAME_W - 66, 53, 58, 4, this.pulse, this.pulse > 0.7 ? PAL.RED_L : PAL.RED, PAL.CHARCOAL);
    drawText(ui, `残り ${Math.max(0, Math.ceil(this.left))}s`, GAME_W - 8, 60, {
      size: 7, color: this.left < 12 ? PAL.RED_L : PAL.SILVER, align: 'right', outline: true,
    });

    drawBreath(g, ui, this.breath, this.t);
    if (this.radioT > 0) {
      drawText(ui, 'MI6「赤、黒、白の順です。落ち着いて」', GAME_W / 2, GAME_H - 46, {
        size: 7, color: PAL.GREEN_OK, align: 'center', outline: true,
      });
    } else {
      drawText(ui, this.radioLeft > 0 ? '[R] MI6に無線（一度だけ）' : '[R] 無線は使い切った', GAME_W - 8, GAME_H - 46, {
        size: 6, color: this.radioLeft > 0 ? rgba(PAL.SILVER, 0.8) : rgba(PAL.STEEL, 0.7),
        align: 'right', outline: true,
      });
    }
    drawHint(ui, this.o.hintText ?? null);
    drawKeys(ui, 'WASD カーソル / J 掴む・差す / C 息を止める（震えが止まる）/ R 無線');

    if (this.left < 6) fade(g, (6 - this.left) / 24, PAL.BLOOD);
  }
}
