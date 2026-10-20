/**
 * 前編の共通土台。
 *
 *   装備を選ぶ → 潜入する → 目的を果たす → 抜け方を評価される
 *
 * 攻め方は縛らない。全員撃ち殺しても、誰にも触れずに抜けても、
 * 当て身で寝かせて回っても、同じように先へ進める。変わるのは講評と台詞。
 */
import type { SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawBar, drawPanel, fade } from '../gfx/ui';
import { ChapterScene } from './chapter';
import { GunStage, type GoonDef } from '../game/gunstage';
import { GUNS, gunLabel } from '../game/guns';
import { DeathScene } from '../scenes/death';
import { LoadoutScene } from '../scenes/loadout';
import { has, startingGun, type KitId } from '../data/loadout';
import { assist, recordFail, clearFails } from '../game/assist';
import { drawHint } from '../gfx/minigame-hud';
import { drawGuide } from '../game/guide';

/** 抜け方 */
export type Style = 'ghost' | 'quiet' | 'loud';

export interface MissionRating {
  style: Style;
  kills: number;
  knockouts: number;
  spotted: number;
  shots: number;
  seconds: number;
}

export abstract class MissionChapter extends ChapterScene {
  protected stage!: GunStage;
  protected kit: KitId[] = [];
  protected playing = false;
  protected objective = '';
  /** 目的地（あれば矢印と点線で示す） */
  protected waypoint: { x: number; y: number; label: string } | null = null;
  protected hintText: string | null = null;
  /** 失敗の記録に使う id */
  protected abstract readonly failId: string;
  /** 死んだ時に戻る場所 */
  protected checkpointX = 0;
  protected checkpointY = 0;

  /** 章側が敵を並べ直すために実装する */
  protected abstract placeGoons(): GoonDef[];

  // ── 装備 ──

  protected chooseKit(ctx: SceneCtx, title: string, brief: string, opts?: { fixed?: KitId[]; hide?: KitId[] }): void {
    ctx.scenes.push(new LoadoutScene({
      title,
      brief,
      fixed: opts?.fixed,
      hide: opts?.hide,
      onDone: (picked, c) => {
        this.kit = picked;
        this.applyKit();
        this.advance(c);
      },
    }));
  }

  protected applyKit(): void {
    if (!this.stage) return;
    this.stage.maxHp = 3 + (has(this.kit, 'vest') ? 1 : 0) + Math.round(assist(this.failId) * 4);
    this.stage.hp = this.stage.maxHp;
    const gun = startingGun(this.kit);
    this.stage.held = gun ? { id: gun, ammo: GUNS[gun].mag * (has(this.kit, 'spare') ? 2 : 1) } : null;
  }

  // ── 進行 ──

  protected beginRaid(ctx: SceneCtx, objective: string): void {
    this.playing = true;
    this.objective = objective;
    this.checkpointX = this.stage.x;
    this.checkpointY = this.stage.y;
    this.stage.spawn(this.placeGoons());
    this.applyKit();
    ctx.audio.music('combat');
  }

  protected restart(ctx: SceneCtx): void {
    const gun = startingGun(this.kit);
    this.stage.reset(this.checkpointX, this.checkpointY, gun);
    this.applyKit();
    this.stage.spawn(this.placeGoons());
    this.playing = true;
    ctx.audio.music('combat');
  }

  override update(ctx: SceneCtx, dt: number): void {
    super.update(ctx, dt);
    if (!this.playing || !this.stage) return;

    this.stage.update(ctx, dt);

    if (this.stage.dead && !ctx.debug.invincible) {
      this.playing = false;
      recordFail(this.failId);
      ctx.scenes.push(new DeathScene(this.deathLine(), (c) => this.restart(c)));
      return;
    }

    this.onRaidUpdate(ctx, dt);
  }

  protected deathLine(): string { return '撃たれた。'; }

  protected onRaidUpdate(_ctx: SceneCtx, _dt: number): void {}

  /** 任務終了。評価を作って返す。 */
  protected rate(): MissionRating {
    const s = this.stage.stats;
    const style: Style = s.spotted === 0 && s.kills === 0 ? 'ghost'
      : s.spotted <= 1 && s.kills <= 1 ? 'quiet'
        : 'loud';
    clearFails(this.failId);
    return {
      style,
      kills: s.kills,
      knockouts: s.knockouts,
      spotted: s.spotted,
      shots: s.shots,
      seconds: Math.round(s.time),
    };
  }

  protected styleName(style: Style): string {
    return style === 'ghost' ? '影' : style === 'quiet' ? '静かな仕事' : '正面突破';
  }

  // ── 描画 ──

  protected override renderBackdrop(ctx: SceneCtx): void {
    if (!this.stage) { super.renderBackdrop(ctx); return; }
    this.stage.render(ctx);
    if (!this.playing) return;

    const g = ctx.display.game;
    const ui = ctx.display.ui;

    // 目的地
    if (this.waypoint) {
      drawGuide(g, ui, this.stage.map, this.stage.cam.drawX, this.stage.cam.drawY,
        { x: this.stage.x, y: this.stage.y },
        { x: this.waypoint.x, y: this.waypoint.y, label: this.waypoint.label, radius: 22 },
        ctx.time, ctx.input.isDown('guide') || has(this.kit, 'tracker'));
    }

    // 目的
    g.fillStyle = rgba(PAL.VOID, 0.62);
    g.fillRect(0, 0, GAME_W, 12);
    drawText(ui, `目的：${this.objective}`, 6, 2, { size: 7, color: PAL.GOLD_L, outline: true });

    // 体力
    const hp = this.stage.hp;
    for (let i = 0; i < this.stage.maxHp; i++) {
      g.fillStyle = i < hp ? PAL.RED_L : rgba(PAL.CHARCOAL, 0.9);
      g.fillRect(GAME_W - 12 - i * 8, 16, 6, 6);
    }

    // 手にしている銃
    const label = gunLabel(this.stage.held);
    drawText(ui, label, 6, 15, {
      size: 7,
      color: this.stage.held && this.stage.held.ammo === 0 ? PAL.RED_L : PAL.WHITE,
      outline: true,
    });
    if (this.stage.held && !GUNS[this.stage.held.id].melee) {
      const spec = GUNS[this.stage.held.id];
      drawBar(g, 6, 25, 46, 3, this.stage.held.ammo / spec.mag,
        this.stage.held.ammo > 0 ? PAL.GOLD : PAL.RED, PAL.CHARCOAL);
    }

    // 警戒状態
    const alerted = this.stage.goons.filter((x) => x.alive && x.alerted).length;
    if (alerted > 0) {
      drawText(ui, this.stage.engaged ? '交戦中' : `${alerted}人が探している`, GAME_W / 2, 15, {
        size: 8, color: this.stage.engaged ? PAL.RED_L : PAL.AMBER,
        align: 'center', bold: true, outline: true,
      });
    }

    drawHint(ui, this.hintText, GAME_H - 22);
    drawText(ui, 'WASD 移動 / Shift 走る / 左クリック 撃つ / E 拾う・当て身 / K 投げる', GAME_W / 2, GAME_H - 11, {
      size: 6, color: rgba(PAL.SILVER, 0.65), align: 'center', outline: true,
    });
  }

  /** 講評パネル。章の終わりに一度だけ出す。 */
  protected drawRating(ctx: SceneCtx, r: MissionRating, t: number): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    fade(g, Math.min(0.8, t));
    const w = 208;
    const h = 96;
    const x = GAME_W / 2 - w / 2;
    const y = GAME_H / 2 - h / 2;
    drawPanel(g, x, y, w, h, { fill: rgba(PAL.VOID, 0.96), border: PAL.GOLD, accent: PAL.GOLD_L });
    drawText(ui, this.styleName(r.style), GAME_W / 2, y + 8, {
      size: 12, color: PAL.GOLD_L, align: 'center', bold: true,
    });
    const rows: [string, string][] = [
      ['殺した', `${r.kills}`],
      ['眠らせた', `${r.knockouts}`],
      ['見つかった', `${r.spotted}`],
      ['撃った弾', `${r.shots}`],
      ['所要', `${r.seconds}秒`],
    ];
    for (let i = 0; i < rows.length; i++) {
      const ry = y + 26 + i * 11;
      drawText(ui, rows[i]![0], x + 20, ry, { size: 7, color: PAL.STEEL });
      drawText(ui, rows[i]![1], x + w - 20, ry, { size: 7, color: PAL.WHITE, align: 'right' });
    }
  }
}
