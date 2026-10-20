/**
 * ミニゲーム共通の小さな表示。
 * 息ゲージ・ヒント行・操作の手引きは、どの章でも同じ位置・同じ見た目にする。
 */
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from './palette';
import { drawText } from './text';
import { drawBar } from './ui';
import type { Breath } from '../game/breath';

/** 息ゲージ（左下）。止めている間は金、喘いでいる間は赤で点滅する。 */
export function drawBreath(
  g: CanvasRenderingContext2D,
  ui: CanvasRenderingContext2D,
  b: Breath,
  time: number,
  x = 8,
  y = GAME_H - 22,
): void {
  const blink = b.gasping && Math.floor(time * 10) % 2 === 0;
  const fg = b.gasping ? (blink ? PAL.RED_L : PAL.RED) : b.held ? PAL.GOLD_L : PAL.STEEL;
  drawBar(g, x, y, 54, 4, b.air, fg, PAL.CHARCOAL);
  drawText(ui, b.gasping ? '息が上がった' : '[C] 息', x, y - 9, {
    size: 6,
    color: b.gasping ? PAL.RED_L : rgba(PAL.SILVER, b.held ? 1 : 0.7),
    outline: true,
  });
}

/** 聞き込みで得た知識を、画面下に一行だけ出す。 */
export function drawHint(ui: CanvasRenderingContext2D, text: string | null, y = GAME_H - 32): void {
  if (!text) return;
  drawText(ui, `— ${text}`, GAME_W / 2, y, {
    size: 6, color: rgba(PAL.GOLD_L, 0.75), align: 'center', outline: true,
  });
}

/** 操作の手引き（最下段） */
export function drawKeys(ui: CanvasRenderingContext2D, text: string): void {
  drawText(ui, text, GAME_W / 2, GAME_H - 11, {
    size: 6, color: rgba(PAL.SILVER, 0.7), align: 'center', outline: true,
  });
}
