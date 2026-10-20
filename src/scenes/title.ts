import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { gunBarrel, fade, vignette, scanlines, cursor, drawPanel } from '../gfx/ui';
import { drawText } from '../gfx/text';
import { PAL, rgba } from '../gfx/palette';
import { CASINO_START, CHAPTER_ORDER, CHAPTER_TITLES, defaultSave, writeSave, type ChapterId } from '../core/save';
import { makeStage } from '../stages/registry';

type Page = 'intro' | 'menu' | 'select';

export class TitleScene implements Scene {
  readonly name = 'title';

  private t = 0;
  private page: Page = 'intro';
  private idx = 0;
  private selIdx = 0;

  onEnter(ctx: SceneCtx): void {
    this.t = 0;
    this.page = 'intro';
    ctx.audio.music('none');
  }

  private get menu(): { label: string; run: (ctx: SceneCtx) => void }[] {
    return [
      {
        label: 'つづきから',
        run: (ctx) => {
          const id = ctx.save.chapter;
          ctx.scenes.reset(makeStage(id, ctx, ctx.save.checkpoint));
        },
      },
      {
        label: 'はじめから',
        run: (ctx) => {
          ctx.save = defaultSave();
          writeSave(ctx.save);
          // 前編の頭（プラハ）から
          ctx.scenes.reset(makeStage(ctx.save.chapter, ctx, 'start'));
        },
      },
      {
        label: 'カジノ編からはじめる',
        run: (ctx) => {
          ctx.save = defaultSave();
          ctx.save.chapter = CASINO_START;
          ctx.save.unlocked = CASINO_START;
          writeSave(ctx.save);
          ctx.scenes.reset(makeStage(CASINO_START, ctx, 'start'));
        },
      },
      {
        label: 'ステージセレクト',
        run: () => { this.page = 'select'; },
      },
    ];
  }

  private get unlockedChapters(): ChapterId[] {
    const max = CHAPTER_ORDER.indexOf(this.lastUnlocked);
    return CHAPTER_ORDER.slice(0, Math.max(1, max + 1));
  }

  private lastUnlocked: ChapterId = 'p00';

  update(ctx: SceneCtx, dt: number): void {
    this.t += dt;
    this.lastUnlocked = ctx.save.unlocked;

    if (this.page === 'intro') {
      if (this.t > 3.4 || ctx.input.justPressed('light')) {
        this.page = 'menu';
        ctx.audio.sfx('sting');
        ctx.audio.music('tension');
      }
      return;
    }

    if (this.page === 'select') {
      const list = this.unlockedChapters;
      if (ctx.input.justPressed('up')) { this.selIdx = (this.selIdx - 1 + list.length) % list.length; ctx.audio.sfx('ui.move'); }
      if (ctx.input.justPressed('down')) { this.selIdx = (this.selIdx + 1) % list.length; ctx.audio.sfx('ui.move'); }
      if (ctx.input.justPressed('cancel')) { this.page = 'menu'; ctx.audio.sfx('ui.cancel'); }
      if (ctx.input.justPressed('light')) {
        const id = list[this.selIdx]!;
        ctx.audio.sfx('ui.confirm');
        ctx.save.chapter = id;
        ctx.save.checkpoint = 'start';
        ctx.scenes.reset(makeStage(id, ctx, 'start'));
      }
      return;
    }

    const m = this.menu;
    if (ctx.input.justPressed('up')) { this.idx = (this.idx - 1 + m.length) % m.length; ctx.audio.sfx('ui.move'); }
    if (ctx.input.justPressed('down')) { this.idx = (this.idx + 1) % m.length; ctx.audio.sfx('ui.move'); }
    if (ctx.input.justPressed('light')) { ctx.audio.sfx('ui.confirm'); m[this.idx]!.run(ctx); }
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    g.fillStyle = PAL.VOID;
    g.fillRect(0, 0, GAME_W, GAME_H);

    if (this.page === 'intro') {
      // ガンバレル
      g.fillStyle = PAL.CHARCOAL;
      g.fillRect(0, 0, GAME_W, GAME_H);
      gunBarrel(g, this.t);
      if (this.t > 2.6) {
        drawText(ui, 'CASINO ROYALE', GAME_W / 2, GAME_H / 2 - 6, {
          size: 14, color: PAL.WHITE, align: 'center', bold: true, tracking: 3, shadow: true,
          alpha: Math.min(1, (this.t - 2.6) / 0.6),
        });
      }
      return;
    }

    // タイトル背景：赤いカーペットの遠景と縦線
    g.fillStyle = PAL.INK;
    g.fillRect(0, 0, GAME_W, GAME_H);
    g.fillStyle = rgba(PAL.BLOOD, 0.45);
    g.fillRect(0, GAME_H - 70, GAME_W, 70);
    for (let x = 0; x < GAME_W; x += 24) {
      g.fillStyle = rgba(PAL.RED, 0.06 + 0.04 * Math.sin(this.t * 0.8 + x));
      g.fillRect(x, 0, 2, GAME_H);
    }
    vignette(g, 0.7);

    drawText(ui, '0 0 7', GAME_W / 2, 26, {
      size: 20, color: PAL.GOLD, align: 'center', bold: true, tracking: 6, shadow: true,
    });
    drawText(ui, 'CASINO ROYALE', GAME_W / 2, 50, {
      size: 12, color: PAL.WHITE, align: 'center', bold: true, tracking: 4, shadow: true,
    });
    drawText(ui, 'プラハ — モンテネグロ', GAME_W / 2, 66, {
      size: 8, color: PAL.SILVER, align: 'center', tracking: 2,
    });

    if (this.page === 'select') {
      // 17章あるので、選択位置を追う窓にする
      const list = this.unlockedChapters;
      const rows = 9;
      const start = Math.max(0, Math.min(list.length - rows, this.selIdx - Math.floor(rows / 2)));
      const shown = Math.min(rows, list.length);
      const h = shown * 12 + 18;
      drawPanel(g, 62, 84, GAME_W - 124, h);
      for (let i = 0; i < shown; i++) {
        const li = start + i;
        const id = list[li];
        if (!id) break;
        const y = 92 + i * 12;
        const sel = li === this.selIdx;
        if (sel) cursor(g, 70, y + 1);
        const prologue = id.startsWith('p');
        drawText(ui, `${id.toUpperCase()}  ${CHAPTER_TITLES[id]}`, 82, y, {
          size: 8, color: sel ? PAL.GOLD_L : prologue ? rgba(PAL.SILVER, 0.75) : PAL.SILVER, bold: sel,
        });
        if (prologue) {
          drawText(ui, '前編', GAME_W - 74, y, { size: 6, color: rgba(PAL.STEEL, 0.9), align: 'right' });
        }
      }
      if (start > 0) drawText(ui, '▲', GAME_W / 2, 86, { size: 6, color: PAL.STEEL, align: 'center' });
      if (start + shown < list.length) {
        drawText(ui, '▼', GAME_W / 2, 84 + h - 8, { size: 6, color: PAL.STEEL, align: 'center' });
      }
      drawText(ui, '[ESC] もどる', GAME_W / 2, GAME_H - 16, { size: 7, color: PAL.STEEL, align: 'center' });
      scanlines(g, 0.05);
      return;
    }

    const m = this.menu;
    for (let i = 0; i < m.length; i++) {
      const y = 104 + i * 16;
      const sel = i === this.idx;
      if (sel) cursor(g, GAME_W / 2 - 54, y + 2);
      drawText(ui, m[i]!.label, GAME_W / 2, y, {
        size: 10, color: sel ? PAL.GOLD_L : PAL.SILVER, align: 'center', bold: sel, shadow: true,
      });
    }

    drawText(ui, `到達章: ${CHAPTER_TITLES[ctx.save.unlocked]}`, GAME_W / 2, GAME_H - 32, {
      size: 7, color: PAL.STEEL, align: 'center',
    });
    drawText(ui, 'J/SPACE 決定   ~ デバッグメニュー', GAME_W / 2, GAME_H - 18, {
      size: 7, color: rgba(PAL.SILVER, 0.6), align: 'center',
    });

    scanlines(g, 0.05);
    fade(g, Math.max(0, 0.5 - this.t * 0.5));
  }
}
