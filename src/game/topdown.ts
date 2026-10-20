/**
 * 見下ろしアクションの共通部分。マップ・カメラ・プレイヤー・敵・エフェクトを
 * ひとまとめにして、章側は「マップと配置と勝利条件」だけ書けばよいようにする。
 */
import type { SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawBar, strokeRect, vignette, scanlines, flash } from '../gfx/ui';
import { drawText } from '../gfx/text';
import type { TileMap } from '../gfx/tiles';
import { drawMachete } from '../gfx/props';
import { Camera } from './camera';
import { Player, ST_MAX, dirVec as facingVec } from './player';
import { Actor } from './entity';
import { Enemy } from './enemy';
import { Particles, FloatTexts } from './fx';
import { dist, type Box } from './physics';
import { drawNameTag } from './guide';
import { drawItem, type ItemKind } from '../gfx/items';

/** 床に置かれた「調べられる物」。キャラと同じ Y ソートに乗る。 */
export interface StageProp {
  x: number;
  y: number;
  kind: ItemKind;
  /** まだ調べていない＝足元を光らせる */
  active: boolean;
  hidden?: boolean;
  /** ExploreChapter が Spot と対応づけるための印 */
  spotId?: string;
}

export interface TopDownOpts {
  map: TileMap;
  spawnX: number;
  spawnY: number;
  /** 画面全体にかける色（夜・地下など） */
  tint?: string;
  tintAlpha?: number;
  vignette?: number;
  /**
   * 掴んで投げた相手がここに落ちると、階段下へ転落する。
   * 第4章の「手すりは折れる」を成立させるための地点。
   */
  throwZones?: readonly { x: number; y: number; r: number }[];
}

/** 床に落ちたマチェット。先に拾ったほうが強い。 */
interface DroppedWeapon { x: number; y: number; t: number }

export class TopDownStage {
  map: TileMap;
  cam = new Camera();
  player: Player;
  enemies: Enemy[] = [];
  npcs: Actor[] = [];
  props: StageProp[] = [];
  particles = new Particles();
  floats = new FloatTexts();

  /** 床のマチェット */
  weapons: DroppedWeapon[] = [];
  /** 直近に起きた出来事（章側の演出用） */
  lastEvent: 'disarm' | 'pickup' | 'throw' | 'fall' | null = null;

  /** 被弾時の赤フラッシュ */
  hurtFlash = 0;
  /** ヒットストップ（秒）。0 より大きい間は世界が止まる。 */
  hitStop = 0;
  /** カウンター成功時のスロー */
  slowMo = 0;

  private opts: TopDownOpts;
  /** 敵の同時攻撃を防ぐためのローテーション */
  private attackerTimer = 0;

  constructor(opts: TopDownOpts) {
    this.opts = opts;
    this.map = opts.map;
    this.player = new Player({ x: opts.spawnX, y: opts.spawnY });
    this.cam.setBounds(this.map.pixelWidth, this.map.pixelHeight);
    this.cam.snapTo(this.player.x, this.player.y);
  }

  get liveEnemies(): Enemy[] { return this.enemies.filter((e) => !e.dead); }

  blockers(exclude?: Actor): Box[] {
    const out: Box[] = [];
    for (const e of this.enemies) if (!e.dead && e !== exclude) out.push(e.foot);
    for (const n of this.npcs) if (!n.dead && n !== exclude) out.push(n.foot);
    return out;
  }

  /**
   * 1フレーム進める。dt はヒットストップとスローを反映した値になる。
   * 戻り値は実際に進んだ秒数。
   */
  update(ctx: SceneCtx, dtRaw: number): number {
    if (this.hurtFlash > 0) this.hurtFlash -= dtRaw * 2.4;

    if (this.hitStop > 0) {
      this.hitStop -= dtRaw;
      this.particles.update(dtRaw * 0.25);
      this.cam.follow(this.player.x, this.player.y - 8, dtRaw);
      return 0;
    }

    let dt = dtRaw;
    if (this.slowMo > 0) { this.slowMo -= dtRaw; dt *= 0.35; }

    this.lastEvent = null;
    const pb = this.blockers();
    this.player.update(dt, ctx.input, ctx.audio, this.map, pb);
    this.updateWeapons(ctx, dt);
    this.updateGrab(ctx);

    // アクティブアタッカーの選定（一番近い敵に殴る権利を与える）
    this.attackerTimer -= dt;
    const live = this.liveEnemies;
    if (this.attackerTimer <= 0 || !live.some((e) => e.activeAttacker)) {
      this.attackerTimer = 1.1;
      let best: Enemy | null = null;
      let bestD = Infinity;
      for (const e of live) {
        const d = dist(e.x, e.y, this.player.x, this.player.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      for (const e of live) e.activeAttacker = e === best;
    }

    for (const e of this.enemies) {
      e.update(dt, this.player, this.map, this.blockers(e));

      // 敵 → プレイヤー
      if (e.tryHit(this.player)) {
        if (ctx.debug.invincible) {
          // デバッグの無敵はカウンター扱いにしない（敵が永久によろけてしまう）
        } else if (this.player.invulnerable) {
          // 回避が間に合った → カウンター成立
          e.stagger(1.15);
          this.slowMo = 0.35;
          this.hitStop = 0.08;
          this.floats.push(e.x, e.y - 22, 'COUNTER', PAL.GOLD_L, 0.9);
          this.particles.hitSpark(e.x, e.chestY, PAL.GOLD_L);
          ctx.audio.sfx('dodge', 1.3);
        } else {
          const hadWeapon = this.player.armed;
          const took = this.player.hurt(e.damage, e.x, e.y, e.tune.knock);
          if (took) {
            this.hurtFlash = 1;
            this.hitStop = 0.06;
            this.cam.shake(3.5, 0.22);
            this.particles.blood(this.player.x, this.player.chestY, this.player.x - e.x, this.player.y - e.y);
            ctx.audio.sfx('hit');
            // 殴られて取り落とした
            if (hadWeapon && !this.player.armed) this.dropWeapon(this.player.x + 10, this.player.y);
          }
        }
      }
    }

    // プレイヤー → 敵
    if (this.player.swingActive) {
      const box = this.player.attackBox();
      for (const e of this.liveEnemies) {
        if (this.player.hitThisSwing.has(e)) continue;
        const f = e.foot;
        const hit = box.x < f.x + f.w && box.x + box.w > f.x
          && box.y < f.y + f.h + 10 && box.y + box.h > f.y - 12;
        if (!hit) continue;

        this.player.hitThisSwing.add(e);

        // 強攻撃を予備動作に合わせると、得物を叩き落とせる
        if (this.player.disarmSwing && e.telegraphing && e.armed) {
          e.disarm();
          this.dropWeapon(e.x + (e.x > this.player.x ? 12 : -12), e.y + 6);
          this.floats.push(e.x, e.y - 26, '弾き飛ばした', PAL.GOLD_L, 0.9);
          this.particles.hitSpark(e.x, e.chestY, PAL.GOLD_L);
          ctx.audio.sfx('shell');
          this.hitStop = 0.08;
          this.lastEvent = 'disarm';
          continue;
        }

        // のけぞり中・息が上がっている・予備動作中の敵にはよく通る
        const bonus = e.winded ? 2.2 : e.aiState === 'stagger' ? 1.8 : e.telegraphing ? 1.25 : 1;
        const dmg = Math.round(this.player.swingDamage * bonus);
        e.hurt(dmg, this.player.x, this.player.y, this.player.swingKnock);
        this.hitStop = this.player.heavySwing ? 0.07 : 0.045;
        this.cam.shake(this.player.heavySwing ? 3 : 1.8, 0.16);
        this.particles.hitSpark(e.x, e.chestY, PAL.WHITE);
        if (bonus > 1) {
          this.particles.blood(e.x, e.chestY, e.x - this.player.x, e.y - this.player.y);
          this.floats.push(e.x, e.y - 24, e.winded ? '息を切らしている！' : bonus > 1.5 ? '追撃！' : '', PAL.RED_L, 0.7);
        }
        ctx.audio.sfx(this.player.heavySwing ? 'punch.heavy' : 'punch');
        if (e.dead) {
          ctx.audio.sfx('bodyfall');
          this.cam.shake(4, 0.3);
        }
      }
    }

    for (const n of this.npcs) n.tick(dt, this.map, this.blockers(n));

    this.particles.update(dt);
    this.floats.update(dt);
    this.cam.follow(this.player.x, this.player.y - 8, dt);
    return dt;
  }

  /** 床に得物を落とす */
  dropWeapon(x: number, y: number): void {
    this.weapons.push({ x, y, t: 0 });
  }

  /**
   * 落ちた得物の取り合い。
   * プレイヤーは踏めば拾う。敵は空手なら拾いに向かう（先を越されると取れない）。
   */
  private updateWeapons(ctx: SceneCtx, dt: number): void {
    const target = this.weapons[0] ?? null;
    for (const e of this.liveEnemies) e.weaponTarget = e.armed ? null : target;

    for (let i = this.weapons.length - 1; i >= 0; i--) {
      const w = this.weapons[i]!;
      w.t += dt;
      if (w.t < 0.35) continue; // 落ちた直後は拾えない

      if (!this.player.armed && dist(this.player.x, this.player.y, w.x, w.y) < 13) {
        this.player.armed = true;
        this.weapons.splice(i, 1);
        this.floats.push(this.player.x, this.player.y - 26, 'マチェットを拾った', PAL.GOLD_L, 1.0);
        ctx.audio.sfx('pickup', 1.2);
        this.lastEvent = 'pickup';
        continue;
      }
      for (const e of this.liveEnemies) {
        if (e.armed) continue;
        if (dist(e.x, e.y, w.x, w.y) > 11) continue;
        e.armed = true;
        this.weapons.splice(i, 1);
        this.floats.push(e.x, e.y - 26, '拾われた', PAL.RED_L, 1.0);
        ctx.audio.sfx('pickup', 0.8);
        break;
      }
    }
  }

  /**
   * 掴んで投げる。よろけている／息が上がっている相手にだけ通る。
   * 投げた先が階段の口なら、そのまま落ちる。
   */
  private updateGrab(ctx: SceneCtx): void {
    if (!this.player.grabRequested) return;
    this.player.grabRequested = false;

    const p = this.player;
    let victim: Enemy | null = null;
    let best = 24;
    for (const e of this.liveEnemies) {
      if (e.aiState !== 'stagger' && !e.winded) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < best) { best = d; victim = e; }
    }
    if (!victim) {
      this.floats.push(p.x, p.y - 28, '掴めない', PAL.STEEL, 0.6);
      return;
    }

    // 向いている方向へ飛ばす
    const [dx, dy] = facingVec(p.facing);
    const throwDist = 46;
    const tx = victim.x + dx * throwDist;
    const ty = victim.y + dy * throwDist;
    victim.knockX = dx * 340;
    victim.knockY = dy * 340;
    victim.stagger(1.5);
    ctx.audio.sfx('bodyfall');
    this.cam.shake(4, 0.28);
    this.lastEvent = 'throw';

    const zone = (this.opts.throwZones ?? []).find((z) => dist(tx, ty, z.x, z.y) < z.r);
    if (zone) {
      victim.hurt(70, p.x, p.y, 0);
      this.particles.dust(victim.x, victim.y, 16, PAL.SILVER);
      this.floats.push(victim.x, victim.y - 30, '手すりが折れた', PAL.GOLD_L, 1.3);
      ctx.audio.sfx('glass');
      this.cam.shake(6, 0.4);
      this.lastEvent = 'fall';
    } else {
      victim.hurt(18, p.x, p.y, 0);
      this.floats.push(victim.x, victim.y - 30, '投げた', PAL.WHITE, 0.8);
    }
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const cx = this.cam.drawX;
    const cy = this.cam.drawY;

    g.fillStyle = PAL.VOID;
    g.fillRect(0, 0, GAME_W, GAME_H);
    this.map.draw(g, cx, cy, GAME_W, GAME_H, false);

    // Y ソート（人も物も同じ列に並べる。奥の物の前をボンドが横切る）
    const actors: Actor[] = [this.player, ...this.enemies, ...this.npcs];
    const layer: { y: number; back: boolean; run: () => void }[] = [];
    for (const a of actors) {
      layer.push({ y: a.y, back: a.dead, run: () => a.draw(g, cx, cy, ctx.debug.showHitboxes) });
    }
    for (const p of this.props) {
      if (p.hidden) continue;
      layer.push({ y: p.y, back: false, run: () => drawItem(g, p.kind, p.x - cx, p.y - cy, ctx.time, p.active) });
    }
    for (const w of this.weapons) {
      layer.push({ y: w.y, back: true, run: () => drawMachete(g, w.x - cx, w.y - cy, ctx.time) });
    }
    layer.sort((a, b) => (a.back === b.back ? a.y - b.y : a.back ? -1 : 1));
    for (const it of layer) it.run();

    // 予備動作の警告表示（回避のタイミングを取れるように）
    for (const e of this.liveEnemies) {
      if (e.telegraphing) {
        const t = Math.floor(ctx.time * 22) % 2 === 0;
        strokeRect(g, e.x - cx - 7, e.y - cy - 26, 14, 4, t ? PAL.RED_L : PAL.RED);
      }
    }

    this.particles.draw(g, cx, cy);
    this.map.draw(g, cx, cy, GAME_W, GAME_H, true);

    if (this.opts.tint) {
      g.fillStyle = rgba(this.opts.tint, this.opts.tintAlpha ?? 0.25);
      g.fillRect(0, 0, GAME_W, GAME_H);
    }
    vignette(g, this.opts.vignette ?? 0.6);
    if (this.hurtFlash > 0) flash(g, this.hurtFlash * 0.45);
    scanlines(g, 0.05);

    const ui = ctx.display.ui;

    // 頭上の名前。近いほど強調する。
    for (const a of actors) {
      if (!a.label || a.dead) continue;
      const sx = a.x - cx;
      const sy = a.y - cy - 24;
      if (sx < -40 || sx > GAME_W + 40 || sy < -12 || sy > GAME_H + 12) continue;
      const near = dist(a.x, a.y, this.player.x, this.player.y) < 34;
      drawNameTag(ui, a.label, sx, sy, near ? PAL.GOLD_L : (a.labelColor ?? rgba(PAL.SILVER, 0.85)), near);
    }

    // 浮き文字
    for (const f of this.floats.list) {
      if (!f.text) continue;
      drawText(ui, f.text, f.x - cx, f.y - cy, {
        size: 8, color: f.color, align: 'center', bold: true, outline: true,
        alpha: Math.min(1, f.t / (f.life * 0.5)),
      });
    }
  }

  /** 体力バーなどの HUD。章側から呼ぶ。 */
  drawHud(ctx: SceneCtx, label = ''): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    const p = this.player;

    drawBar(g, 8, 9, 72, 5, p.hp / p.maxHp, PAL.RED, PAL.CHARCOAL);
    drawText(ui, p.armed ? 'BOND — マチェット' : 'BOND', 8, 2, { size: 6, color: p.armed ? PAL.GOLD_L : PAL.SILVER, outline: true });

    // スタミナ
    if (p.flags.stamina) {
      const low = p.exhaustT > 0;
      const col = low ? PAL.RED_L : p.steadying ? PAL.GOLD_L : PAL.TEAL;
      drawBar(g, 8, 17, 72, 4, p.st / ST_MAX, col, PAL.CHARCOAL);
      drawText(ui, low ? '息が上がった' : p.steadying ? '呼吸を整えている' : '[C] 呼吸を整える', 8, 23, {
        size: 6, color: low ? PAL.RED_L : rgba(PAL.SILVER, p.steadying ? 1 : 0.65), outline: true,
      });
    } else if (p.dodgeCd > 0) {
      drawBar(g, 8, 17, 72, 2, 1 - p.dodgeCd / 0.71, PAL.STEEL, PAL.INK, PAL.CHARCOAL);
    }

    // ボス（オバンノ）の体力
    const boss = this.enemies.find((e) => e.kind === 'obanno');
    if (boss && !boss.dead) {
      g.fillStyle = rgba(PAL.VOID, 0.72);
      g.fillRect(GAME_W / 2 - 84, GAME_H - 30, 168, 24);
      drawBar(g, GAME_W / 2 - 70, GAME_H - 16, 140, 5, boss.hp / boss.maxHp, PAL.BLOOD, PAL.CHARCOAL, PAL.SLATE);
      drawText(ui, 'スティーヴン・オバンノ', GAME_W / 2, GAME_H - 26, {
        size: 7, color: PAL.RED_L, align: 'center', outline: true,
      });
    }

    // 雑魚の頭上バー
    const cx = this.cam.drawX;
    const cy = this.cam.drawY;
    for (const e of this.liveEnemies) {
      if (e.kind !== 'obanno') {
        drawBar(g, e.x - cx - 8, e.y - cy - 24, 16, 2, e.hp / e.maxHp, PAL.RED_L, PAL.INK, PAL.CHARCOAL);
      }
      // 息が上がっている間は、はっきり見せる（反撃の合図）
      if (e.winded) {
        drawText(ui, '息切れ', e.x - cx, e.y - cy - 36, {
          size: 7, color: PAL.GOLD_L, align: 'center', bold: true, outline: true,
        });
      }
      if (e.armed) {
        drawText(ui, '⚔', e.x - cx + 11, e.y - cy - 22, {
          size: 7, color: PAL.RED_L, align: 'center', outline: true,
        });
      }
    }

    if (label) {
      drawText(ui, label, GAME_W / 2, 6, { size: 8, color: PAL.GOLD_L, align: 'center', outline: true });
    }
  }
}
