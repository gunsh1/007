/**
 * 「歩いて調べて話す」章の共通土台（第00・01・02・07章）。
 * マップと調べる場所を並べるだけで章が書けるようにする。
 *
 *  ・NPC の頭上に常時、名前を出す
 *  ・調べられる物は床に実際に描き、頭上に品名を常時出す（未調査なら足元が光る）
 *  ・[F] で目的地までの経路を点線、目的地をエリアで表示する
 *  ・目的地が画面外なら、押していなくても端に矢印を出す
 */
import type { SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawBar } from '../gfx/ui';
import { ChapterScene } from './chapter';
import { TopDownStage } from '../game/topdown';
import { Actor } from '../game/entity';
import { dist } from '../game/physics';
import { drawGuide, drawSpotMarker, drawNameTag, clearGuideCache, type GuideTarget } from '../game/guide';
import type { ItemKind } from '../gfx/items';
import type { LookName } from '../gfx/actors';
import type { MusicTrack } from '../core/audio';

/** 調べられる既定の距離。物の上に立てなくても届くよう、少し広めに取る。 */
const SPOT_RADIUS = 26;

export interface Spot {
  id: string;
  x: number;
  y: number;
  label: string;
  radius?: number;
  /** 一度きりか */
  once?: boolean;
  /** この条件を満たすまで反応しない */
  enabled?: (ctx: SceneCtx) => boolean;
  /** 道案内に出す短い名前（省略時は label） */
  guideLabel?: string;
  /** 道案内の対象にしない（寄り道のフレーバー） */
  optional?: boolean;
  /** 床に実際に描く物の見た目。省略すると印だけ。 */
  item?: ItemKind;
  /** 頭上に常時出す品名（省略時は guideLabel ?? label） */
  itemName?: string;
  /** 物を描く位置の縦ずらし。卓の上に載せたいときは負の値。 */
  itemOffsetY?: number;
  run: (ctx: SceneCtx) => void;
}

export interface NpcDef {
  id: string;
  /** 頭上に出す名前。省略すると出さない。 */
  name?: string;
  look: LookName;
  x: number;
  y: number;
  facing?: 'up' | 'down' | 'left' | 'right';
  /** 名前の色 */
  color?: string;
}

export abstract class ExploreChapter extends ChapterScene {
  protected stage!: TopDownStage;
  protected spots: Spot[] = [];
  protected doneSpots = new Set<string>();
  protected npcById = new Map<string, Actor>();
  protected npcDefs: NpcDef[] = [];
  protected playing = false;
  protected objective = '';
  protected music: MusicTrack = 'calm';
  /** 章側から明示的に指定する目的地。null なら次のスポットを自動で使う。 */
  protected guideOverride: GuideTarget | null = null;
  private hint = '';

  protected setup(stage: TopDownStage, npcs: NpcDef[], spots: Spot[]): void {
    this.stage = stage;
    this.spots = spots;
    this.npcDefs = npcs;
    clearGuideCache();
    for (const n of npcs) {
      const a = new Actor({ look: n.look, x: n.x, y: n.y, facing: n.facing ?? 'down' });
      if (n.name) { a.label = n.name; a.labelColor = n.color ?? null; }
      this.npcById.set(n.id, a);
      stage.npcs.push(a);
    }
    for (const s of spots) {
      if (!s.item || s.item === 'none') continue;
      stage.props.push({
        x: s.x, y: s.y + (s.itemOffsetY ?? 0), kind: s.item, active: true, spotId: s.id,
      });
    }
  }

  /** 物の名前（頭上に出す文字）。空文字なら出さない。 */
  private spotName(s: Spot): string { return s.itemName ?? s.guideLabel ?? s.label; }

  /** 調べ終わった物・まだ現れていない物の光り方を合わせる */
  private syncProps(ctx: SceneCtx): void {
    for (const p of this.stage.props) {
      if (!p.spotId) continue;
      const s = this.spots.find((v) => v.id === p.spotId);
      if (!s) continue;
      const live = !this.doneSpots.has(s.id) && (!s.enabled || s.enabled(ctx));
      p.active = live;
    }
  }

  protected npc(id: string): Actor | undefined { return this.npcById.get(id); }

  /** 全ての必須スポットを踏んだか */
  protected allDone(ids: string[]): boolean { return ids.every((i) => this.doneSpots.has(i)); }

  /** いま向かうべき場所 */
  protected get guideTarget(): GuideTarget | null {
    if (this.guideOverride) return this.guideOverride;
    const next = this.spots.find(
      (s) => !this.doneSpots.has(s.id) && !s.optional && (!s.enabled || s.enabled(this.lastCtx!)),
    );
    if (!next) return null;
    return { x: next.x, y: next.y, label: next.guideLabel ?? next.label, radius: (next.radius ?? SPOT_RADIUS) + 4 };
  }

  /** guideTarget の enabled 判定に ctx が要るので、直近のものを持っておく */
  private lastCtx: SceneCtx | null = null;

  protected override renderBackdrop(ctx: SceneCtx): void {
    if (!this.stage) { super.renderBackdrop(ctx); return; }
    this.stage.render(ctx);

    const ui = ctx.display.ui;
    const g = ctx.display.game;
    const camX = this.stage.cam.drawX;
    const camY = this.stage.cam.drawY;
    const guiding = this.playing && ctx.input.isDown('guide');

    // 道案内の目的地（ラベルが二重にならないよう先に取っておく）
    const target = this.guideTarget;

    // 調べられる物・場所は、画面内なら常に名前を出す。
    // 近いほど明るく、まだ手が出せないものは灰色（そこに何があるかは分かる）。
    for (const s of this.spots) {
      if (this.doneSpots.has(s.id)) continue;
      const hasItem = s.item !== undefined && s.item !== 'none';
      const sx = s.x - camX;
      // 印は物の真上に置く（物の高さぶん持ち上げる）
      const sy = s.y - camY + (hasItem ? (s.itemOffsetY ?? 0) - 18 : -28);
      if (sx < -24 || sx > GAME_W + 24 || sy < -8 || sy > GAME_H + 8) continue;
      const locked = s.enabled ? !s.enabled(ctx) : false;
      const near = !locked && dist(s.x, s.y, this.stage.player.x, this.stage.player.y) < (s.radius ?? SPOT_RADIUS) + 26;
      if (!locked) drawSpotMarker(g, sx, sy, ctx.time, near);
      // 目的地そのものは drawGuide がラベルを出すので重ねない
      const isTarget = target !== null && Math.abs(target.x - s.x) < 2 && Math.abs(target.y - s.y) < 2;
      if (guiding && isTarget) continue;
      const name = this.spotName(s);
      if (!name) continue; // 人の上など、別の名前が既に出ている場所
      const color = locked ? rgba(PAL.SILVER, 0.6)
        : near ? PAL.GOLD_L
        : rgba(PAL.GOLD, s.optional ? 0.55 : 0.8);
      drawNameTag(ui, name, sx, sy - 9, color, near);
    }

    // 道案内
    if (this.playing && target) {
      drawGuide(g, ui, this.stage.map, camX, camY,
        { x: this.stage.player.x, y: this.stage.player.y }, target, ctx.time, guiding);
    }

    // HUD
    if (this.objective) {
      g.fillStyle = rgba(PAL.VOID, 0.62);
      g.fillRect(0, 0, GAME_W, 12);
      drawText(ui, `目的：${this.objective}`, 6, 2, { size: 7, color: PAL.GOLD_L, outline: true });
      if (this.playing) {
        drawText(ui, guiding ? '[F] 案内中' : '[F] 目的地', GAME_W - 6, 2, {
          size: 7, color: guiding ? PAL.GOLD_L : rgba(PAL.SILVER, 0.8), align: 'right', outline: true,
        });
      }
    }
    if (this.hint) {
      drawText(ui, this.hint, GAME_W / 2, GAME_H - 24, {
        size: 8, color: PAL.GOLD_L, align: 'center', outline: true,
      });
    }
    if (this.playing) {
      drawText(ui, 'WASD 移動 / E 調べる / F 目的地', GAME_W / 2, GAME_H - 12, {
        size: 6, color: rgba(PAL.SILVER, 0.7), align: 'center', outline: true,
      });
      const p = this.stage.player;
      if (p.hp < p.maxHp) drawBar(g, 8, GAME_H - 12, 60, 4, p.hp / p.maxHp, PAL.RED, PAL.CHARCOAL);
    }
  }

  override update(ctx: SceneCtx, dt: number): void {
    super.update(ctx, dt);
    this.lastCtx = ctx;
    if (!this.playing || !this.stage) return;

    this.stage.update(ctx, dt);
    this.onPlayUpdate(ctx, dt);
    this.syncProps(ctx);

    this.hint = '';
    const p = this.stage.player;
    for (const s of this.spots) {
      if (s.once !== false && this.doneSpots.has(s.id)) continue;
      if (s.enabled && !s.enabled(ctx)) continue;
      if (dist(p.x, p.y, s.x, s.y) > (s.radius ?? SPOT_RADIUS)) continue;
      this.hint = `[E] ${s.label}`;
      if (ctx.input.justPressed('interact')) {
        ctx.audio.sfx('ui.confirm');
        this.doneSpots.add(s.id);
        this.hint = '';
        clearGuideCache();
        s.run(ctx);
      }
      break;
    }
  }

  /** 章ごとの追加処理（尾行者の更新など） */
  protected onPlayUpdate(_ctx: SceneCtx, _dt: number): void {}

  /** 探索を開始／停止 */
  protected play(ctx: SceneCtx, objective: string): void {
    this.playing = true;
    this.objective = objective;
    this.lastCtx = ctx;
    clearGuideCache();
    ctx.audio.music(this.music);
  }

  protected pausePlay(): void { this.playing = false; }
}
