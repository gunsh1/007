import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { drawPanel, cursor, fade } from '../gfx/ui';
import { drawLines, drawText, wrap, Typewriter } from '../gfx/text';
import { PAL, rgba } from '../gfx/palette';
import { anims, type LookName } from '../gfx/actors';

export type Beat =
  | { kind: 'line'; who: string; text: string; portrait?: LookName }
  | { kind: 'narr'; text: string }
  | { kind: 'choice'; prompt?: string; options: { id: string; label: string }[] }
  | { kind: 'wait'; seconds: number }
  | { kind: 'fx'; run: (ctx: SceneCtx) => void };

export type Script = readonly Beat[];

/** 会話の結果。choice の id → 選んだ選択肢の id */
export type DialogueResult = Record<string, string>;

const BOX_H = 62;
const BOX_Y = GAME_H - BOX_H - 6;
const PAD = 8;
const PORTRAIT = 34;

/**
 * ADVウィンドウ。下のシーンは描画だけ継続し、更新は止める。
 * 台詞は UI レイヤ（実解像度）に、枠はゲームレイヤ（ドット）に描く。
 */
export class DialogueScene implements Scene {
  readonly name = 'dialogue';
  readonly transparentRender = true;
  readonly transparentUpdate = false;
  readonly clearUIBelow = true;

  private i = 0;
  private tw = new Typewriter();
  private wrapped: string[] = [];
  private choiceIdx = 0;
  private waitLeft = 0;
  private result: DialogueResult = {};
  private lastShown = 0;
  private prepared = false;
  private choiceKey = 0;

  constructor(
    private script: Script,
    private onDone?: (result: DialogueResult, ctx: SceneCtx) => void,
  ) {}

  onEnter(ctx: SceneCtx): void {
    this.i = 0;
    this.prepared = false;
    this.prepare(ctx);
  }

  private get beat(): Beat | undefined { return this.script[this.i]; }

  private prepare(ctx: SceneCtx): void {
    const b = this.beat;
    if (!b) { this.finish(ctx); return; }

    switch (b.kind) {
      case 'line':
      case 'narr': {
        const maxW = b.kind === 'line'
          ? GAME_W - PAD * 2 - PORTRAIT - 10
          : GAME_W - PAD * 2 - 8;
        this.wrapped = wrap(ctx.display.ui, b.text, maxW, 9);
        this.tw.set(this.wrapped);
        this.lastShown = 0;
        this.prepared = true;
        break;
      }
      case 'choice':
        this.choiceIdx = 0;
        this.choiceKey++;
        this.prepared = true;
        break;
      case 'wait':
        this.waitLeft = b.seconds;
        this.prepared = true;
        break;
      case 'fx':
        b.run(ctx);
        this.i++;
        this.prepare(ctx);
        break;
    }
  }

  private advance(ctx: SceneCtx): void {
    this.i++;
    this.prepare(ctx);
  }

  private finish(ctx: SceneCtx): void {
    ctx.scenes.pop();
    this.onDone?.(this.result, ctx);
  }

  update(ctx: SceneCtx, dt: number): void {
    const b = this.beat;
    if (!b || !this.prepared) return;

    if (b.kind === 'wait') {
      this.waitLeft -= dt;
      if (this.waitLeft <= 0 || ctx.input.justPressed('light')) this.advance(ctx);
      return;
    }

    if (b.kind === 'choice') {
      const n = b.options.length;
      if (ctx.input.justPressed('up')) {
        this.choiceIdx = (this.choiceIdx - 1 + n) % n;
        ctx.audio.sfx('ui.move');
      }
      if (ctx.input.justPressed('down')) {
        this.choiceIdx = (this.choiceIdx + 1) % n;
        ctx.audio.sfx('ui.move');
      }
      if (ctx.input.justPressed('light')) {
        const picked = b.options[this.choiceIdx]!;
        this.result[`c${this.choiceKey}`] = picked.id;
        this.result['last'] = picked.id;
        ctx.audio.sfx('ui.confirm');
        this.advance(ctx);
      }
      return;
    }

    // line / narr
    const fast = ctx.input.isDown('light');
    this.tw.update(dt, fast);
    const shown = this.tw.shownCount;
    if (shown > this.lastShown) {
      // 2文字ごとに軽い打鍵音
      if (shown % 2 === 0) ctx.audio.sfx('tick', 0.9 + (shown % 5) * 0.03);
      this.lastShown = shown;
    }
    if (ctx.input.justPressed('light')) {
      if (!this.tw.done) this.tw.skip();
      else this.advance(ctx);
    }
  }

  render(ctx: SceneCtx, _alpha: number): void {
    const b = this.beat;
    if (!b || !this.prepared) return;
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    // 下部を軽く暗くして文字を浮かせる
    fade(g, 0.12);

    if (b.kind === 'wait' || b.kind === 'fx') return;

    if (b.kind === 'choice') {
      this.renderChoice(ctx, b);
      return;
    }

    const isNarr = b.kind === 'narr';
    drawPanel(g, PAD - 4, BOX_Y, GAME_W - (PAD - 4) * 2, BOX_H, {
      fill: rgba(PAL.VOID, 0.9),
      border: isNarr ? PAL.STEEL : PAL.SILVER,
      accent: isNarr ? PAL.STEEL : PAL.GOLD,
    });

    let textX = PAD + 4;
    if (!isNarr) {
      // 立ち絵（顔だけ 2倍で切り出す）
      const box = { x: PAD, y: BOX_Y + 8, w: PORTRAIT, h: PORTRAIT };
      g.fillStyle = rgba(PAL.CHARCOAL, 0.9);
      g.fillRect(box.x, box.y, box.w, box.h);
      g.strokeStyle = PAL.STEEL;
      g.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
      if (b.portrait) {
        const sp = anims(b.portrait).idle.down.frames[0]!;
        g.save();
        g.beginPath();
        g.rect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
        g.clip();
        g.imageSmoothingEnabled = false;
        // 頭部（上8px）を中心に 3倍
        g.drawImage(sp.canvas, 1, 0, 10, 11, box.x + 2, box.y + 2, 30, 33);
        g.restore();
      }
      textX = PAD + PORTRAIT + 6;

      drawText(ui, b.who, textX, BOX_Y + 4, {
        size: 8, color: PAL.GOLD_L, bold: true, shadow: true,
      });
    }

    const lines = this.tw.visible();
    drawLines(ui, lines, textX, BOX_Y + (isNarr ? 10 : 16), 12, {
      size: 9,
      color: isNarr ? PAL.SILVER : PAL.WHITE,
      shadow: true,
    });

    // 送りマーク
    if (this.tw.done) {
      const bob = Math.sin(ctx.time * 6) > 0 ? 0 : 1;
      cursor(g, GAME_W - PAD - 8, BOX_Y + BOX_H - 12 + bob, PAL.GOLD_L);
    }
  }

  private renderChoice(ctx: SceneCtx, b: Extract<Beat, { kind: 'choice' }>): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    const n = b.options.length;
    const rowH = 14;
    const h = n * rowH + 12 + (b.prompt ? 14 : 0);
    const w = GAME_W - 80;
    const x = 40;
    const y = GAME_H - h - 14;

    drawPanel(g, x, y, w, h, { fill: rgba(PAL.VOID, 0.94) });

    let ty = y + 7;
    if (b.prompt) {
      drawText(ui, b.prompt, x + 10, ty, { size: 8, color: PAL.SILVER, shadow: true });
      ty += 14;
    }
    for (let i = 0; i < n; i++) {
      const sel = i === this.choiceIdx;
      if (sel) cursor(g, x + 7, ty + 1);
      drawText(ui, b.options[i]!.label, x + 18, ty, {
        size: 9,
        color: sel ? PAL.GOLD_L : PAL.SILVER,
        bold: sel,
        shadow: true,
      });
      ty += rowH;
    }
  }
}

/** 会話を1本流すショートカット */
export function say(ctx: SceneCtx, script: Script, onDone?: (r: DialogueResult, c: SceneCtx) => void): void {
  ctx.scenes.push(new DialogueScene(script, onDone));
}
