/**
 * 装備選択。任務に入る前に3つだけ選ぶ。
 * ここでの選択が、そのまま「攻め方」を決める。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawPanel, cursor, fade } from '../gfx/ui';
import { drawText, wrap } from '../gfx/text';
import { KIT, SLOTS, type KitId } from '../data/loadout';

export interface LoadoutOpts {
  title: string;
  /** 任務の一行説明 */
  brief: string;
  /** 選べない（必ず持つ）装備 */
  fixed?: KitId[];
  /** 出さない装備 */
  hide?: KitId[];
  onDone: (picked: KitId[], ctx: SceneCtx) => void;
}

export class LoadoutScene implements Scene {
  readonly name = 'loadout';
  readonly transparentRender = true;
  readonly transparentUpdate = false;
  readonly clearUIBelow = true;

  private idx = 0;
  private picked: KitId[] = [];
  private items = KIT;

  constructor(private o: LoadoutOpts) {}

  onEnter(ctx: SceneCtx): void {
    this.items = KIT.filter((k) => !(this.o.hide ?? []).includes(k.id));
    this.picked = [...(this.o.fixed ?? [])];
    this.idx = 0;
    ctx.audio.sfx('ui.confirm');
  }

  private get slots(): number { return SLOTS; }

  private toggle(ctx: SceneCtx): void {
    const it = this.items[this.idx];
    if (!it) return;
    if ((this.o.fixed ?? []).includes(it.id)) { ctx.audio.sfx('ui.error'); return; }
    const at = this.picked.indexOf(it.id);
    if (at >= 0) { this.picked.splice(at, 1); ctx.audio.sfx('ui.cancel'); return; }
    if (this.picked.length >= this.slots) { ctx.audio.sfx('ui.error'); return; }
    this.picked.push(it.id);
    ctx.audio.sfx('ui.move', 1.2);
  }

  update(ctx: SceneCtx, _dt: number): void {
    const inp = ctx.input;
    const n = this.items.length;
    if (inp.justPressed('up')) { this.idx = (this.idx - 1 + n) % n; ctx.audio.sfx('ui.move'); }
    if (inp.justPressed('down')) { this.idx = (this.idx + 1) % n; ctx.audio.sfx('ui.move'); }
    if (inp.justPressed('light')) this.toggle(ctx);
    if (inp.justPressed('interact') || inp.justPressed('menu')) {
      ctx.audio.sfx('ui.confirm');
      ctx.scenes.pop();
      this.o.onDone([...this.picked], ctx);
    }
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    fade(g, 0.82);

    const w = GAME_W - 28;
    const h = GAME_H - 24;
    const x = 14;
    const y = 12;
    drawPanel(g, x, y, w, h, { fill: rgba(PAL.VOID, 0.96), border: PAL.GOLD, accent: PAL.GOLD_L });

    drawText(ui, this.o.title, x + 10, y + 6, { size: 9, color: PAL.GOLD_L, bold: true });
    drawText(ui, `装備 ${this.picked.length} / ${this.slots}`, x + w - 10, y + 6, {
      size: 7, color: this.picked.length >= this.slots ? PAL.GOLD_L : PAL.STEEL, align: 'right',
    });
    drawText(ui, this.o.brief, x + 10, y + 18, { size: 7, color: PAL.SILVER });

    const rowH = 13;
    const top = y + 32;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]!;
      const ry = top + i * rowH;
      const sel = i === this.idx;
      const on = this.picked.includes(it.id);
      const locked = (this.o.fixed ?? []).includes(it.id);
      if (sel) cursor(g, x + 8, ry + 2);
      g.fillStyle = on ? PAL.GOLD_L : rgba(PAL.STEEL, 0.5);
      g.fillRect(x + 20, ry + 3, 5, 5);
      drawText(ui, it.name, x + 30, ry, {
        size: 8, color: sel ? PAL.WHITE : on ? PAL.GOLD_L : PAL.SILVER, bold: sel,
      });
      if (locked) drawText(ui, '固定', x + w - 12, ry, { size: 6, color: PAL.STEEL, align: 'right' });
    }

    // 選択中の説明
    const cur = this.items[this.idx];
    if (cur) {
      const ny = top + this.items.length * rowH + 6;
      g.fillStyle = rgba(PAL.CHARCOAL, 0.6);
      g.fillRect(x + 8, ny, w - 16, 22);
      const lines = wrap(ui, cur.note, w - 26, 7);
      for (let i = 0; i < Math.min(2, lines.length); i++) {
        drawText(ui, lines[i]!, x + 14, ny + 4 + i * 9, { size: 7, color: PAL.WHITE });
      }
    }

    drawText(ui, '↑↓ 選ぶ  /  J 付け外し  /  E 出発', GAME_W / 2, y + h - 12, {
      size: 7, color: rgba(PAL.SILVER, 0.85), align: 'center',
    });
  }
}
