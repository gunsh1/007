/**
 * 章の土台。ステップ列を進めるだけの「進行役」シーン。
 * 会話・ポーカー卓・アクションステージは、この上に積んで動かす。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { fade, letterbox, vignette } from '../gfx/ui';
import { drawText } from '../gfx/text';
import { CHAPTER_TITLES, unlockChapter, writeSave, type ChapterId } from '../core/save';
import { makeStage } from './registry';

export abstract class ChapterScene implements Scene {
  abstract readonly name: string;
  abstract readonly id: ChapterId;

  protected step = 0;
  /** 章タイトルの表示時間 */
  protected titleT = 2.6;
  protected fadeT = 1;

  onEnter(ctx: SceneCtx): void {
    unlockChapter(ctx.save, this.id);
    ctx.save.chapter = this.id;
    writeSave(ctx.save);
    this.step = 0;
    this.run(ctx);
  }

  /** step に応じて次の演出を積む。サブシーン完了時にも呼ばれる。 */
  protected abstract run(ctx: SceneCtx): void;

  protected advance(ctx: SceneCtx): void {
    this.step++;
    this.run(ctx);
  }

  protected jumpTo(ctx: SceneCtx, step: number): void {
    this.step = step;
    this.run(ctx);
  }

  /** 次の章へ */
  protected goChapter(ctx: SceneCtx, id: ChapterId): void {
    ctx.save.chapter = id;
    ctx.save.checkpoint = 'start';
    writeSave(ctx.save);
    ctx.scenes.reset(makeStage(id, ctx, 'start'));
  }

  update(ctx: SceneCtx, dt: number): void {
    if (this.titleT > 0) this.titleT -= dt;
    if (this.fadeT > 0) this.fadeT = Math.max(0, this.fadeT - dt * 1.2);
    void ctx;
  }

  render(ctx: SceneCtx, _alpha: number): void {
    const g = ctx.display.game;
    this.renderBackdrop(ctx);
    if (this.titleT > 0) this.renderTitle(ctx);
    if (this.fadeT > 0) fade(g, this.fadeT);
  }

  /** 章ごとの背景。既定は暗転。 */
  protected renderBackdrop(ctx: SceneCtx): void {
    const g = ctx.display.game;
    g.fillStyle = PAL.VOID;
    g.fillRect(0, 0, GAME_W, GAME_H);
  }

  protected renderTitle(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    const a = Math.min(1, this.titleT / 0.6);
    letterbox(g, 34);
    const num = this.id.replace('ch', '');
    drawText(ui, `CHAPTER ${num}`, GAME_W / 2, GAME_H / 2 - 16, {
      size: 8, color: rgba(PAL.GOLD, a), align: 'center', tracking: 3, alpha: a,
    });
    drawText(ui, CHAPTER_TITLES[this.id], GAME_W / 2, GAME_H / 2 - 2, {
      size: 14, color: PAL.WHITE, align: 'center', bold: true, tracking: 1, alpha: a, shadow: true,
    });
  }
}

// ── 背景の描き分け ───────────────────────────────────────────

/** カジノ・ロワイヤルの大広間。シャンデリアと赤い壁。 */
export function drawCasinoHall(g: CanvasRenderingContext2D, t: number): void {
  g.fillStyle = '#170a10';
  g.fillRect(0, 0, GAME_W, GAME_H);

  // 奥の壁（金の腰壁つき）
  g.fillStyle = '#2a1119';
  g.fillRect(0, 0, GAME_W, 96);
  g.fillStyle = PAL.GOLD;
  g.fillRect(0, 94, GAME_W, 1);
  g.fillStyle = rgba(PAL.GOLD, 0.35);
  for (let x = 8; x < GAME_W; x += 32) g.fillRect(x, 20, 1, 74);

  // シャンデリア
  for (const cx of [72, 192, 312]) {
    const flick = 0.85 + 0.15 * Math.sin(t * 3 + cx);
    g.fillStyle = rgba(PAL.GOLD_L, 0.9 * flick);
    g.fillRect(cx - 1, 6, 2, 12);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + t * 0.2;
      g.fillRect(Math.round(cx + Math.cos(a) * 9), Math.round(18 + Math.sin(a) * 3), 2, 2);
    }
    const grad = g.createRadialGradient(cx, 20, 2, cx, 20, 60);
    grad.addColorStop(0, rgba(PAL.GOLD_L, 0.16 * flick));
    grad.addColorStop(1, rgba(PAL.GOLD_L, 0));
    g.fillStyle = grad;
    g.fillRect(cx - 60, 0, 120, 120);
  }

  // 赤絨毯の床
  g.fillStyle = PAL.BLOOD;
  g.fillRect(0, 95, GAME_W, GAME_H - 95);
  g.fillStyle = '#7d1620';
  for (let y = 100; y < GAME_H; y += 6) {
    for (let x = (y % 12 === 0 ? 0 : 3); x < GAME_W; x += 6) g.fillRect(x, y, 1, 1);
  }
  vignette(g, 0.62);
}

/** ホテルの一室・列車内などの汎用な暗い室内 */
export function drawDimRoom(g: CanvasRenderingContext2D, tone: string = PAL.CHARCOAL): void {
  g.fillStyle = PAL.VOID;
  g.fillRect(0, 0, GAME_W, GAME_H);
  g.fillStyle = tone;
  g.fillRect(0, 0, GAME_W, 110);
  g.fillStyle = PAL.SLATE;
  g.fillRect(0, 108, GAME_W, 2);
  g.fillStyle = '#1a1620';
  g.fillRect(0, 110, GAME_W, GAME_H - 110);
  vignette(g, 0.7);
}
