/** 死亡時のオーバーレイ。チェックポイントから即リトライする。 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { fade, drawPanel, cursor } from '../gfx/ui';
import { drawText } from '../gfx/text';
import { PAL, rgba } from '../gfx/palette';

export class DeathScene implements Scene {
  readonly name = 'death';
  readonly transparentRender = true;
  readonly transparentUpdate = false;
  readonly clearUIBelow = true;

  private t = 0;
  private idx = 0;

  constructor(
    private message: string,
    private onRetry: (ctx: SceneCtx) => void,
    private onQuit?: (ctx: SceneCtx) => void,
  ) {}

  onEnter(ctx: SceneCtx): void {
    this.t = 0;
    ctx.audio.music('none');
    ctx.audio.sfx('sting');
  }

  private get options(): string[] {
    return this.onQuit ? ['チェックポイントから', 'タイトルへ'] : ['チェックポイントから'];
  }

  update(ctx: SceneCtx, dt: number): void {
    this.t += dt;
    if (this.t < 1.1) return;
    const n = this.options.length;
    if (ctx.input.justPressed('up')) { this.idx = (this.idx - 1 + n) % n; ctx.audio.sfx('ui.move'); }
    if (ctx.input.justPressed('down')) { this.idx = (this.idx + 1) % n; ctx.audio.sfx('ui.move'); }
    if (ctx.input.justPressed('light')) {
      ctx.audio.sfx('ui.confirm');
      ctx.scenes.pop();
      if (this.idx === 0) this.onRetry(ctx);
      else this.onQuit?.(ctx);
    }
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    fade(g, Math.min(0.86, this.t * 1.1), PAL.BLOOD);
    fade(g, Math.min(0.6, this.t * 0.8));

    const a = Math.min(1, Math.max(0, (this.t - 0.4) / 0.5));
    drawText(ui, 'MISSION FAILED', GAME_W / 2, GAME_H / 2 - 34, {
      size: 14, color: PAL.RED_L, align: 'center', bold: true, tracking: 2, alpha: a, shadow: true,
    });
    drawText(ui, this.message, GAME_W / 2, GAME_H / 2 - 14, {
      size: 8, color: rgba(PAL.SILVER, 0.9), align: 'center', alpha: a,
    });

    if (this.t < 1.1) return;
    const opts = this.options;
    for (let i = 0; i < opts.length; i++) {
      const y = GAME_H / 2 + 8 + i * 16;
      const sel = i === this.idx;
      if (sel) cursor(g, GAME_W / 2 - 62, y + 2);
      drawText(ui, opts[i]!, GAME_W / 2, y, {
        size: 10, color: sel ? PAL.GOLD_L : PAL.SILVER, align: 'center', bold: sel,
      });
    }
    drawPanel(g, GAME_W / 2 - 74, GAME_H / 2 + 2, 148, opts.length * 16 + 8, {
      fill: rgba(PAL.VOID, 0), border: rgba(PAL.STEEL, 0.5), accent: rgba(PAL.RED, 0.7),
    });
  }
}
