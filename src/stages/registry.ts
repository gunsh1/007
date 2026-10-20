import type { ChapterId } from '../core/save';
import { CHAPTER_TITLES } from '../core/save';
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { drawPanel, fade } from '../gfx/ui';
import { drawText } from '../gfx/text';
import { PAL } from '../gfx/palette';

export type StageFactory = (ctx: SceneCtx, checkpoint: string) => Scene;

const table = new Map<ChapterId, StageFactory>();

export function registerStage(id: ChapterId, f: StageFactory): void {
  table.set(id, f);
}

export function hasStage(id: ChapterId): boolean { return table.has(id); }

export function makeStage(id: ChapterId, ctx: SceneCtx, checkpoint = 'start'): Scene {
  const f = table.get(id);
  if (f) return f(ctx, checkpoint);
  return new StubScene(id);
}

/** 未実装の章に入ったときの案内。開発中に黒画面で止まらないようにする。 */
export class StubScene implements Scene {
  readonly name: string;
  constructor(private id: ChapterId) { this.name = `stub:${id}`; }

  update(ctx: SceneCtx): void {
    // 自分しかスタックに居ないときに pop すると画面が止まるので、その時は何もしない
    if (ctx.scenes.depth <= 1) return;
    if (ctx.input.justPressed('cancel') || ctx.input.justPressed('light')) {
      ctx.audio.sfx('ui.cancel');
      ctx.scenes.pop();
    }
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    fade(g, 1);
    drawPanel(g, 40, GAME_H / 2 - 30, GAME_W - 80, 60);
    drawText(ctx.display.ui, `${this.id.toUpperCase()} ${CHAPTER_TITLES[this.id]}`, GAME_W / 2, GAME_H / 2 - 18, {
      size: 10, color: PAL.GOLD_L, align: 'center', bold: true,
    });
    drawText(ctx.display.ui, '未実装の章です', GAME_W / 2, GAME_H / 2 - 2, {
      size: 9, color: PAL.SILVER, align: 'center',
    });
    drawText(ctx.display.ui, ctx.scenes.depth > 1 ? '[J] もどる' : '[~] デバッグメニューから他の章へ', GAME_W / 2, GAME_H / 2 + 14, {
      size: 8, color: PAL.STEEL, align: 'center',
    });
  }
}
