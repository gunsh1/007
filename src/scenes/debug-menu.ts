/**
 * デバッグメニュー（`~` キー）。
 * 各機能を単体で検証するための正式な入口。章ジャンプ・無敵・チップ編集・
 * ポーカーのハンド指定などをここから叩く。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { drawPanel, cursor, fade } from '../gfx/ui';
import { drawText } from '../gfx/text';
import { PAL, rgba } from '../gfx/palette';
import { CHAPTER_ORDER, CHAPTER_TITLES, clearSave, defaultSave, money, writeSave } from '../core/save';
import { makeStage } from '../stages/registry';
import { PlaygroundScene } from './playground';
import { DEBUG_KEY } from '../core/input';

interface Item {
  label: (ctx: SceneCtx) => string;
  value?: (ctx: SceneCtx) => string;
  onConfirm?: (ctx: SceneCtx, self: DebugMenu) => void;
  onLeft?: (ctx: SceneCtx) => void;
  onRight?: (ctx: SceneCtx) => void;
}

const CHIP_STEP = 1_000_000;

export class DebugMenu implements Scene {
  readonly name = 'debug';
  readonly transparentRender = true;
  readonly transparentUpdate = false;
  readonly clearUIBelow = true;

  private idx = 0;
  private page: 'main' | 'chapters' = 'main';
  private chapterIdx = 0;
  private wasLocked = false;
  private notice = '';
  private noticeT = 0;

  private items: Item[] = [
    {
      label: () => '章へジャンプ',
      onConfirm: (_c, self) => { self.page = 'chapters'; },
    },
    {
      label: () => 'PLAYGROUND（動作確認）',
      onConfirm: (ctx) => { ctx.scenes.pop(); ctx.scenes.reset(new PlaygroundScene()); },
    },
    {
      label: () => '無敵',
      value: (ctx) => (ctx.debug.invincible ? 'ON' : 'OFF'),
      onConfirm: (ctx) => { ctx.debug.invincible = !ctx.debug.invincible; },
      onLeft: (ctx) => { ctx.debug.invincible = false; },
      onRight: (ctx) => { ctx.debug.invincible = true; },
    },
    {
      label: () => '当たり判定表示',
      value: (ctx) => (ctx.debug.showHitboxes ? 'ON' : 'OFF'),
      onConfirm: (ctx) => { ctx.debug.showHitboxes = !ctx.debug.showHitboxes; },
    },
    {
      // 卓に着いた瞬間に結果だけ確定させる。章の流れを確かめる時用。
      label: () => 'ポーカーを飛ばす',
      value: (ctx) => (ctx.debug.skipPoker ? 'ON（自動）' : 'OFF（[P]で個別）'),
      onConfirm: (ctx) => { ctx.debug.skipPoker = !ctx.debug.skipPoker; },
      onLeft: (ctx) => { ctx.debug.skipPoker = false; },
      onRight: (ctx) => { ctx.debug.skipPoker = true; },
    },
    {
      label: () => 'ボンドのチップ',
      value: (ctx) => money(ctx.save.chips),
      onLeft: (ctx) => { ctx.save.chips = Math.max(0, ctx.save.chips - CHIP_STEP); },
      onRight: (ctx) => { ctx.save.chips += CHIP_STEP; },
    },
    {
      label: () => 'ル・シッフルのチップ',
      value: (ctx) => money(ctx.save.chiffreChips),
      onLeft: (ctx) => { ctx.save.chiffreChips = Math.max(0, ctx.save.chiffreChips - CHIP_STEP); },
      onRight: (ctx) => { ctx.save.chiffreChips += CHIP_STEP; },
    },
    {
      label: () => '癖の読み（tellRead）',
      value: (ctx) => `${ctx.save.tellRead}`,
      onLeft: (ctx) => { ctx.save.tellRead = Math.max(0, ctx.save.tellRead - 10); },
      onRight: (ctx) => { ctx.save.tellRead = Math.min(100, ctx.save.tellRead + 10); },
    },
    {
      label: () => 'ヴェスパー信頼度',
      value: (ctx) => `${ctx.save.vesper}`,
      onLeft: (ctx) => { ctx.save.vesper = Math.max(0, ctx.save.vesper - 10); },
      onRight: (ctx) => { ctx.save.vesper = Math.min(100, ctx.save.vesper + 10); },
    },
    {
      label: () => 'サウンド',
      value: (ctx) => (ctx.audio.muted ? 'MUTE' : 'ON'),
      onConfirm: (ctx) => { ctx.audio.toggleMute(); },
    },
    {
      label: () => '全章を解放',
      onConfirm: (ctx, self) => {
        ctx.save.unlocked = CHAPTER_ORDER[CHAPTER_ORDER.length - 1]!;
        writeSave(ctx.save);
        self.say('全章を解放しました');
      },
    },
    {
      label: () => 'セーブを書き出す',
      onConfirm: (ctx, self) => { writeSave(ctx.save); self.say('セーブしました'); },
    },
    {
      label: () => 'セーブを消去',
      onConfirm: (ctx, self) => {
        clearSave();
        ctx.save = defaultSave();
        self.say('セーブを消去しました');
      },
    },
    {
      label: () => '閉じる',
      onConfirm: (ctx) => { ctx.scenes.pop(); },
    },
  ];

  say(msg: string): void { this.notice = msg; this.noticeT = 2.2; }

  onEnter(ctx: SceneCtx): void {
    this.wasLocked = ctx.input.locked;
    ctx.input.locked = false;
    this.page = 'main';
  }

  onExit(ctx: SceneCtx): void {
    ctx.input.locked = this.wasLocked;
  }

  update(ctx: SceneCtx, dt: number): void {
    if (this.noticeT > 0) this.noticeT -= dt;
    const inp = ctx.input;

    if (inp.rawJustPressed(DEBUG_KEY)) { ctx.scenes.pop(); return; }

    if (this.page === 'chapters') {
      const n = CHAPTER_ORDER.length;
      if (inp.justPressed('up')) { this.chapterIdx = (this.chapterIdx - 1 + n) % n; ctx.audio.sfx('ui.move'); }
      if (inp.justPressed('down')) { this.chapterIdx = (this.chapterIdx + 1) % n; ctx.audio.sfx('ui.move'); }
      if (inp.justPressed('cancel')) { this.page = 'main'; ctx.audio.sfx('ui.cancel'); }
      if (inp.justPressed('light')) {
        const id = CHAPTER_ORDER[this.chapterIdx]!;
        ctx.audio.sfx('ui.confirm');
        ctx.save.chapter = id;
        ctx.save.checkpoint = 'start';
        ctx.scenes.pop();
        ctx.scenes.reset(makeStage(id, ctx, 'start'));
      }
      return;
    }

    const n = this.items.length;
    if (inp.justPressed('up')) { this.idx = (this.idx - 1 + n) % n; ctx.audio.sfx('ui.move'); }
    if (inp.justPressed('down')) { this.idx = (this.idx + 1) % n; ctx.audio.sfx('ui.move'); }
    const it = this.items[this.idx]!;
    if (inp.justPressed('left') && it.onLeft) { it.onLeft(ctx); ctx.audio.sfx('ui.move', 0.8); }
    if (inp.justPressed('right') && it.onRight) { it.onRight(ctx); ctx.audio.sfx('ui.move', 1.2); }
    if (inp.justPressed('light') && it.onConfirm) { ctx.audio.sfx('ui.confirm'); it.onConfirm(ctx, this); }
    if (inp.justPressed('cancel')) { ctx.audio.sfx('ui.cancel'); ctx.scenes.pop(); }
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    fade(g, 0.68);

    const x = 20;
    const y = 14;
    const w = GAME_W - 40;
    const h = GAME_H - 28;
    drawPanel(g, x, y, w, h, { fill: rgba(PAL.VOID, 0.95), border: PAL.RED, accent: PAL.RED_L });

    drawText(ui, this.page === 'main' ? 'DEBUG' : 'CHAPTER JUMP', x + 10, y + 6, {
      size: 9, color: PAL.RED_L, bold: true, tracking: 1.5,
    });
    drawText(ui, '~ で閉じる', x + w - 10, y + 6, { size: 7, color: PAL.STEEL, align: 'right' });

    if (this.page === 'chapters') {
      const rowH = 13;
      for (let i = 0; i < CHAPTER_ORDER.length; i++) {
        const id = CHAPTER_ORDER[i]!;
        const ry = y + 22 + i * rowH;
        const sel = i === this.chapterIdx;
        if (sel) cursor(g, x + 8, ry + 1);
        drawText(ui, `${id.toUpperCase()}  ${CHAPTER_TITLES[id]}`, x + 20, ry, {
          size: 8, color: sel ? PAL.GOLD_L : PAL.SILVER, bold: sel,
        });
      }
      return;
    }

    const rowH = 12;
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]!;
      const ry = y + 22 + i * rowH;
      const sel = i === this.idx;
      if (sel) cursor(g, x + 8, ry + 1);
      drawText(ui, it.label(ctx), x + 20, ry, {
        size: 8, color: sel ? PAL.GOLD_L : PAL.SILVER, bold: sel,
      });
      if (it.value) {
        drawText(ui, it.value(ctx), x + w - 12, ry, {
          size: 8, color: sel ? PAL.WHITE : PAL.STEEL, align: 'right',
        });
      }
    }

    if (this.noticeT > 0) {
      drawText(ui, this.notice, GAME_W / 2, y + h - 14, {
        size: 8, color: PAL.GOLD_L, align: 'center', alpha: Math.min(1, this.noticeT),
      });
    }
    drawText(ui, `scenes: ${ctx.scenes.names.join(' > ')}`, x + 10, y + h - 10, {
      size: 6, color: PAL.STEEL,
    });
  }
}
