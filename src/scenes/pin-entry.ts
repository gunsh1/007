/**
 * 暗証番号の端末（原作 L.69）。
 * 「勝者が登録した自身の暗証番号を入力すれば、我々スイス銀行は世界中どこでも、
 *   ご指定の口座に1億5000万ドルを送金いたします」
 *
 *  register … 第3章。自分で決めて登録する。
 *  verify   … 終幕。登録した番号を自分で思い出して打つ。
 *             3回間違えるごとに1文字ずつ思い出す（アシスト）。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { drawPanel, fade } from '../gfx/ui';
import { drawText } from '../gfx/text';
import { PAL, rgba } from '../gfx/palette';

const MAX_LEN = 8;
const MIN_LEN = 3;

export interface PinOpts {
  mode: 'register' | 'verify';
  /** verify の時の正解 */
  expected?: string;
  title?: string;
  subtitle?: string;
  /** verify で正解した時の試行回数を受け取る */
  onDone: (pin: string, ctx: SceneCtx, attempts: number) => void;
}

export class PinEntryScene implements Scene {
  readonly name = 'pin';
  readonly transparentRender = true;
  readonly transparentUpdate = false;
  readonly clearUIBelow = true;

  private value = '';
  private t = 0;
  private error = 0;
  private attempts = 0;
  private message = '';

  constructor(private o: PinOpts) {}

  private get expected(): string { return (this.o.expected ?? '').toUpperCase(); }

  /** 3回間違えるごとに頭から1文字ずつ思い出す */
  private get revealed(): number {
    if (this.o.mode !== 'verify') return 0;
    return Math.min(this.expected.length, Math.floor(this.attempts / 3));
  }

  update(ctx: SceneCtx, dt: number): void {
    this.t += dt;
    if (this.error > 0) this.error -= dt;

    const typed = ctx.input.takeTyped();
    for (const ch of typed) {
      if (!/[a-zA-Z0-9]/.test(ch)) continue;
      if (this.value.length >= MAX_LEN) { ctx.audio.sfx('ui.error'); this.error = 0.6; break; }
      this.value += ch.toUpperCase();
      ctx.audio.sfx('tick', 1.1);
    }

    if (ctx.input.rawJustPressed('Backspace') && this.value.length > 0) {
      this.value = this.value.slice(0, -1);
      ctx.audio.sfx('ui.cancel');
    }

    if (!ctx.input.rawJustPressed('Enter')) return;

    if (this.o.mode === 'verify') {
      if (this.value === this.expected) {
        ctx.audio.sfx('ui.confirm');
        ctx.scenes.pop();
        this.o.onDone(this.value, ctx, this.attempts + 1);
        return;
      }
      this.attempts++;
      this.value = '';
      this.error = 1.2;
      ctx.audio.sfx('ui.error');
      const r = this.revealed;
      this.message = r > 0
        ? `……違う。最初の${r}文字は「${this.expected.slice(0, r)}」だったはずだ`
        : '……違う。もう一度。';
      return;
    }

    if (this.value.length < MIN_LEN) {
      ctx.audio.sfx('ui.error');
      this.error = 0.8;
      this.message = `${MIN_LEN}文字以上で入力してください`;
      return;
    }
    ctx.audio.sfx('ui.confirm');
    ctx.scenes.pop();
    this.o.onDone(this.value, ctx, 1);
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    fade(g, 0.78);

    const w = 240;
    const h = 104;
    const x = (GAME_W - w) / 2;
    const y = (GAME_H - h) / 2 - 6;
    drawPanel(g, x, y, w, h, { fill: rgba(PAL.VOID, 0.96), border: PAL.GOLD, accent: PAL.GOLD_L });

    const verify = this.o.mode === 'verify';
    drawText(ui, this.o.title ?? (verify ? 'スイス銀行 — 送金手続き' : 'スイス銀行 — 暗証番号の登録'), GAME_W / 2, y + 8, {
      size: 8, color: PAL.GOLD_L, align: 'center', bold: true,
    });
    drawText(
      ui,
      this.o.subtitle ?? (verify
        ? '第3章で自分が登録した番号を入力してください'
        : '勝者はこの番号で 1億5000万ドルを受け取る'),
      GAME_W / 2, y + 20,
      { size: 6, color: PAL.SILVER, align: 'center' },
    );

    // 入力枠
    const slotW = 20;
    const total = MAX_LEN * slotW;
    const sx = GAME_W / 2 - total / 2;
    const sy = y + 36;
    const reveal = this.revealed;
    for (let i = 0; i < MAX_LEN; i++) {
      const bx = sx + i * slotW;
      const filled = i < this.value.length;
      const isCaret = i === this.value.length;
      g.fillStyle = filled ? rgba(PAL.CHARCOAL, 0.9) : rgba(PAL.VOID, 0.6);
      g.fillRect(bx + 2, sy, slotW - 4, 20);
      g.fillStyle = isCaret && Math.floor(this.t * 3) % 2 === 0 ? PAL.GOLD_L : PAL.SLATE;
      g.fillRect(bx + 2, sy + 19, slotW - 4, 1);
      if (filled) {
        drawText(ui, this.value[i]!, bx + slotW / 2, sy + 5, {
          size: 12, color: PAL.WHITE, align: 'center', bold: true,
        });
      } else if (verify && i < reveal) {
        // 思い出した文字は薄く出す
        drawText(ui, this.expected[i]!, bx + slotW / 2, sy + 5, {
          size: 12, color: rgba(PAL.GOLD, 0.45), align: 'center', bold: true,
        });
      }
    }

    if (verify) {
      drawText(ui, `試行 ${this.attempts + 1} 回目`, x + w - 10, y + 8, {
        size: 6, color: PAL.STEEL, align: 'right',
      });
    }

    const foot = this.error > 0 && this.message
      ? this.message
      : '英数字を入力  /  BACKSPACE 削除  /  ENTER 決定';
    drawText(ui, foot, GAME_W / 2, y + h - 14, {
      size: 6, color: this.error > 0 ? PAL.RED_L : rgba(PAL.SILVER, 0.8), align: 'center',
    });
  }
}
