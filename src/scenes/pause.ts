/**
 * ポーズメニュー（TAB）。
 * 「原作ログ」からは、そこまでに到達した章に対応する 007casino.txt の原文を読める。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawPanel, cursor, fade } from '../gfx/ui';
import { drawText, wrap } from '../gfx/text';
import { CHAPTER_ORDER, CHAPTER_TITLES, money, writeSave } from '../core/save';
import { unlockedSource, type SourceLine } from '../data/story';
import { TitleScene } from './title';

type Page = 'main' | 'log' | 'status';

export class PauseScene implements Scene {
  readonly name = 'pause';
  readonly transparentRender = true;
  readonly transparentUpdate = false;
  readonly clearUIBelow = true;

  private page: Page = 'main';
  private idx = 0;
  private logIdx = 0;
  private logScroll = 0;
  private lines: SourceLine[] = [];

  onEnter(ctx: SceneCtx): void {
    this.page = 'main';
    this.idx = 0;
    this.lines = unlockedSource(ctx.save.unlocked, CHAPTER_ORDER);
    ctx.audio.sfx('ui.confirm');
  }

  private items(ctx: SceneCtx): { label: string; run: () => void }[] {
    return [
      { label: '続ける', run: () => ctx.scenes.pop() },
      { label: '原作ログ', run: () => { this.page = 'log'; this.logIdx = Math.max(0, this.lines.length - 1); this.logScroll = 0; } },
      { label: '任務の状況', run: () => { this.page = 'status'; } },
      { label: `サウンド：${ctx.audio.muted ? 'OFF' : 'ON'}`, run: () => ctx.audio.toggleMute() },
      {
        label: 'タイトルへ戻る',
        run: () => {
          writeSave(ctx.save);
          ctx.scenes.pop();
          ctx.scenes.reset(new TitleScene());
        },
      },
    ];
  }

  update(ctx: SceneCtx, _dt: number): void {
    const inp = ctx.input;

    if (this.page === 'log') {
      const n = Math.max(1, this.lines.length);
      if (inp.justPressed('up')) { this.logIdx = (this.logIdx - 1 + n) % n; this.logScroll = 0; ctx.audio.sfx('ui.move'); }
      if (inp.justPressed('down')) { this.logIdx = (this.logIdx + 1) % n; this.logScroll = 0; ctx.audio.sfx('ui.move'); }
      if (inp.justPressed('cancel') || inp.justPressed('menu')) { this.page = 'main'; ctx.audio.sfx('ui.cancel'); }
      return;
    }

    if (this.page === 'status') {
      if (inp.justPressed('cancel') || inp.justPressed('light') || inp.justPressed('menu')) {
        this.page = 'main';
        ctx.audio.sfx('ui.cancel');
      }
      return;
    }

    const items = this.items(ctx);
    if (inp.justPressed('up')) { this.idx = (this.idx - 1 + items.length) % items.length; ctx.audio.sfx('ui.move'); }
    if (inp.justPressed('down')) { this.idx = (this.idx + 1) % items.length; ctx.audio.sfx('ui.move'); }
    if (inp.justPressed('light')) { ctx.audio.sfx('ui.confirm'); items[this.idx]!.run(); }
    if (inp.justPressed('cancel') || inp.justPressed('menu')) { ctx.audio.sfx('ui.cancel'); ctx.scenes.pop(); }
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    fade(g, 0.74);
    ui.save();
    ui.fillStyle = rgba(PAL.VOID, 0.55);
    ui.fillRect(0, 0, GAME_W, GAME_H);
    ui.restore();

    if (this.page === 'log') { this.renderLog(ctx); return; }
    if (this.page === 'status') { this.renderStatus(ctx); return; }

    const items = this.items(ctx);
    const w = 180;
    const h = items.length * 16 + 34;
    const x = GAME_W / 2 - w / 2;
    const y = GAME_H / 2 - h / 2;
    drawPanel(ui, x, y, w, h, { fill: rgba(PAL.VOID, 0.96) });

    drawText(ui, 'PAUSE', GAME_W / 2, y + 8, {
      size: 9, color: PAL.GOLD_L, align: 'center', bold: true, tracking: 3,
    });
    drawText(ui, CHAPTER_TITLES[ctx.save.chapter], GAME_W / 2, y + 20, {
      size: 6, color: PAL.STEEL, align: 'center',
    });

    for (let i = 0; i < items.length; i++) {
      const iy = y + 32 + i * 16;
      const sel = i === this.idx;
      if (sel) cursor(ui, x + 16, iy + 2);
      drawText(ui, items[i]!.label, GAME_W / 2, iy, {
        size: 9, color: sel ? PAL.GOLD_L : PAL.SILVER, align: 'center', bold: sel,
      });
    }
  }

  private renderLog(ctx: SceneCtx): void {
    const ui = ctx.display.ui;
    const x = 14;
    const y = 12;
    const w = GAME_W - 28;
    const h = GAME_H - 24;
    drawPanel(ui, x, y, w, h, { fill: rgba(PAL.VOID, 0.97) });

    drawText(ui, '原作ログ — 007casino.txt', x + 10, y + 6, {
      size: 8, color: PAL.GOLD_L, bold: true,
    });
    drawText(ui, '↑↓ 選択  /  ESC 戻る', x + w - 10, y + 6, {
      size: 6, color: PAL.STEEL, align: 'right',
    });

    if (this.lines.length === 0) {
      drawText(ui, 'まだ何も読んでいない。', GAME_W / 2, GAME_H / 2, {
        size: 8, color: PAL.STEEL, align: 'center',
      });
      return;
    }

    // 左：行の一覧
    const listW = 92;
    const visible = 12;
    const start = Math.max(0, Math.min(this.lines.length - visible, this.logIdx - Math.floor(visible / 2)));
    for (let i = 0; i < Math.min(visible, this.lines.length); i++) {
      const li = start + i;
      const s = this.lines[li];
      if (!s) break;
      const ly = y + 20 + i * 12;
      const sel = li === this.logIdx;
      if (sel) cursor(ui, x + 6, ly + 1);
      drawText(ui, `L.${s.line}  ${s.chapter.toUpperCase()}`, x + 18, ly, {
        size: 7, color: sel ? PAL.GOLD_L : PAL.STEEL, bold: sel,
      });
    }

    // 右：本文
    const cur = this.lines[this.logIdx]!;
    const tx = x + listW + 10;
    const tw = w - listW - 22;
    drawText(ui, CHAPTER_TITLES[cur.chapter], tx, y + 20, {
      size: 7, color: PAL.RED_L,
    });
    const body = wrap(ui, cur.text, tw, 8);
    for (let i = 0; i < body.length && i < 15; i++) {
      drawText(ui, body[i]!, tx, y + 34 + i * 11 - this.logScroll, {
        size: 8, color: PAL.WHITE,
      });
    }
  }

  /** いま手元にある物。ゲーム中で拾った・埋め込んだ物をここで確認できる。 */
  private gear(ctx: SceneCtx): [string, string][] {
    const s = ctx.save;
    const out: [string, string][] = [];
    if (s.flags['tracker']) out.push(['発信機（GPS）', '左腕に埋め込み済み']);
    const cover = (['gambler', 'married', 'none'] as const).find((k) => s.flags[`cover:${k}`]);
    if (cover) {
      out.push(['カバーストーリー', cover === 'gambler' ? 'プロの賭博師と令嬢'
        : cover === 'married' ? '新婚旅行中の夫婦' : '設定なし']);
    }
    if (CHAPTER_ORDER.indexOf(s.chapter) >= CHAPTER_ORDER.indexOf('ch03')) {
      out.push(['タキシード', 'ヴェスパーが用意した']);
    }
    if (s.flags['chiefExposed']) out.push(['署長買収の証拠', 'マティスへ報告済み']);
    if (s.felixBacking) out.push(['CIAの資金', 'フィリックスから']);
    return out;
  }

  private renderStatus(ctx: SceneCtx): void {
    const ui = ctx.display.ui;
    const s = ctx.save;
    const gear = this.gear(ctx);
    const w = 250;
    // 8行の状況 + 区切り + 所持品の行数ぶん
    const h = 155 + Math.max(1, gear.length) * 11;
    const x = GAME_W / 2 - w / 2;
    const y = GAME_H / 2 - h / 2;
    drawPanel(ui, x, y, w, h, { fill: rgba(PAL.VOID, 0.97) });

    drawText(ui, '任務の状況', GAME_W / 2, y + 7, {
      size: 9, color: PAL.GOLD_L, align: 'center', bold: true,
    });

    const rows: [string, string][] = [
      ['章', CHAPTER_TITLES[s.chapter]],
      ['所持金', money(s.chips)],
      ['ル・シッフル', money(s.chiffreChips)],
      ['暗証番号', s.pin ? `${s.pin.length}文字（登録済み）` : '未登録'],
      ['癖の読み', `${s.tellRead} / 100`],
      ['こちらの癖の漏れ', `${s.tellLeak} / 100`],
      ['ヴェスパーとの信頼', `${s.vesper} / 100`],
      ['フィリックスの資金', s.felixBacking ? '受けた' : 'まだ'],
    ];
    for (let i = 0; i < rows.length; i++) {
      const ry = y + 24 + i * 12;
      drawText(ui, rows[i]![0], x + 14, ry, { size: 7, color: PAL.STEEL });
      drawText(ui, rows[i]![1], x + w - 14, ry, { size: 7, color: PAL.WHITE, align: 'right' });
    }

    // ── 所持品 ──
    const gy = y + 24 + rows.length * 12 + 4;
    ui.fillStyle = rgba(PAL.GOLD, 0.35);
    ui.fillRect(x + 14, gy, w - 28, 1);
    drawText(ui, '所持品', x + 14, gy + 4, { size: 7, color: PAL.GOLD_L, bold: true });
    if (gear.length === 0) {
      drawText(ui, 'まだ何も持っていない', x + w - 14, gy + 4, {
        size: 7, color: PAL.STEEL, align: 'right',
      });
    }
    for (let i = 0; i < gear.length; i++) {
      const ry = gy + 15 + i * 11;
      drawText(ui, `・${gear[i]![0]}`, x + 14, ry, { size: 7, color: PAL.GOLD_L });
      drawText(ui, gear[i]![1], x + w - 14, ry, { size: 7, color: PAL.SILVER, align: 'right' });
    }

    drawText(ui, '[ESC] 戻る', GAME_W / 2, y + h - 12, {
      size: 6, color: PAL.STEEL, align: 'center',
    });
  }
}
