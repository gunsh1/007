/**
 * 前編 第5章 マイアミ国際空港（原作 L.27〜L.47）
 *
 *  カルロスを追って空港へ。従業員通路の扉には解除コードがかかっている。
 *  コードは「ELLIPSIS」——第1章でモロカの携帯から出てきたあの言葉。
 *  自分で打たせる（覚えていなければ、Mへの電話がヒントをくれる）。
 *
 *  その先はタンカーの阻止。前編の締め。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawBar } from '../gfx/ui';
import { registerStage } from './registry';
import { MissionChapter } from './mission';
import { GunStage, type GoonDef } from '../game/gunstage';
import { say } from '../game/dialogue';
import { PinEntryScene } from '../scenes/pin-entry';
import { buildAirport, P05 } from '../data/maps-prologue';
import { has } from '../data/loadout';
import { src } from '../data/story';
import { dist } from '../game/physics';

/** タンカーを止めるまでの距離 */
const TANKER_RUN = 340;

class P05Airport extends MissionChapter {
  readonly name = 'p05';
  readonly id: ChapterId = 'p05';
  protected readonly failId = 'p05';

  private phase: 'terminal' | 'chase' | 'done' = 'terminal';
  private doorOpen = false;
  private codeAsked = false;
  /** タンカーとの残り距離 */
  private gap = TANKER_RUN;
  private tankerX = 0;
  private carlos = -1;

  constructor() {
    super();
    this.stage = new GunStage({
      map: buildAirport(),
      spawnX: P05.spawn.x,
      spawnY: P05.spawn.y,
      tint: PAL.NAVY,
      tintAlpha: 0.12,
      vignette: 0.62,
    });
  }

  protected placeGoons(): GoonDef[] {
    return [
      // 空港警備（ターミナル）
      { x: 120, y: 200, look: 'guestB', gun: 'ppk', patrol: [{ x: 80, y: 160 }, { x: 200, y: 160 }, { x: 200, y: 300 }] },
      { x: 180, y: 320, look: 'guestB', gun: 'ppk', facing: -Math.PI / 2, sweep: 0.9 },
      // 機関室（カルロスの手先）
      { x: P05.engineRoom.x - 40, y: P05.engineRoom.y + 40, look: 'thug', gun: 'smg', facing: Math.PI / 2, sweep: 0.6 },
      { x: P05.engineRoom.x + 60, y: P05.engineRoom.y + 20, look: 'thug', gun: 'rifle', facing: Math.PI, sweep: 0.5 },
      // 駐機場
      { x: 480, y: 250, look: 'thug', gun: 'shotgun', patrol: [{ x: 440, y: 250 }, { x: 600, y: 250 }] },
      { x: 560, y: 330, look: 'thug', gun: 'smg', facing: -Math.PI / 2, sweep: 0.8 },
    ];
  }

  protected override deathLine(): string {
    return this.phase === 'chase' ? 'タンカーに追いつけなかった。' : '空港の警備に撃たれた。';
  }

  protected override onRaidUpdate(ctx: SceneCtx, dt: number): void {
    if (this.phase === 'done') return;

    if (this.phase === 'terminal') {
      // 施錠された扉
      if (!this.doorOpen && !this.codeAsked
        && dist(this.stage.x, this.stage.y, P05.door.x, P05.door.y) < 26) {
        this.codeAsked = true;
        this.playing = false;
        this.askCode(ctx);
        return;
      }
      // 機関室を抜けて駐機場へ
      if (this.doorOpen && this.stage.x > P05.engineRoom.x + 140) {
        this.phase = 'chase';
        this.gap = TANKER_RUN;
        this.objective = 'タンカーに追いつけ';
        this.waypoint = null;
        this.hintText = '走れば詰まる。だが撃たれる';
        ctx.audio.music('combat');
        say(ctx, [
          { kind: 'narr', text: src(33) },
          { kind: 'line', who: 'M', text: '狙いはスカイフリートよ。あの燃料車を止めなさい。', portrait: 'mendel' },
        ]);
      }
      return;
    }

    // ── タンカー追跡 ──
    const sprint = ctx.input.isDown('dodge');
    this.gap -= (sprint ? 62 : 26) * dt;
    this.tankerX += dt * 40;
    // 運転席から撃ってくる
    if (this.carlos < 0) this.carlos = 0;
    this.carlos -= dt;
    if (this.carlos <= 0 && this.gap < 240) {
      this.carlos = 0.9 + this.gap / 400;
      const a = Math.atan2(this.stage.y - (this.stage.y - 60), 0) + 0;
      void a;
      this.stage.bullets.push({
        x: this.stage.x + Math.sin(this.tankerX) * 30, y: this.stage.y - 120,
        px: this.stage.x, py: this.stage.y - 130,
        vx: 0, vy: 300, fromHero: false, life: 1.2, color: PAL.RED_L,
      });
      ctx.audio.sfx('gunshot', 0.8);
    }

    if (this.gap <= 0) {
      this.phase = 'done';
      this.playing = false;
      this.finish(ctx);
    }
  }

  private askCode(ctx: SceneCtx): void {
    const knows = has(this.kit, 'picks');
    say(ctx, [
      { kind: 'narr', text: src(29) },
      { kind: 'line', who: 'ジェームズ・ボンド', text: '解除コード。……Mに繋いでくれ。', portrait: 'bond' },
      { kind: 'narr', text: src(31) },
      {
        kind: 'narr',
        text: knows
          ? 'ロックピックが端子を噛む。だが、コードは覚えている。'
          : 'モロカの携帯に残っていた、あの一語。',
      },
    ], (_r, c) => {
      c.scenes.push(new PinEntryScene({
        mode: 'verify',
        expected: 'ELLIPSIS',
        title: '従業員用出入口 — 解除コード',
        subtitle: 'モロカの携帯に残されていた言葉を入力してください',
        onDone: (_v, cc) => {
          this.doorOpen = true;
          this.playing = true;
          this.objective = '機関室を抜けて駐機場へ';
          this.waypoint = { x: P05.engineRoom.x + 160, y: P05.engineRoom.y + 80, label: '駐機場' };
          cc.audio.sfx('door');
        },
      }));
    });
  }

  private finish(ctx: SceneCtx): void {
    const r = this.rate();
    ctx.audio.music('none');
    say(ctx, [
      { kind: 'narr', text: src(37) },
      { kind: 'narr', text: src(39) },
      { kind: 'narr', text: src(41) },
      { kind: 'line', who: 'ジェームズ・ボンド', text: '……自分のベルトに何がついているか、確かめる暇もなかったな。', portrait: 'bond' },
      { kind: 'narr', text: src(43) },
      { kind: 'narr', text: src(45) },
      { kind: 'narr', text: src(47) },
      {
        kind: 'line', who: 'M',
        text: r.style === 'loud'
          ? `${r.kills}人。空港でよ、007。……それでも、飛行機は無事だったわ。`
          : '飛行機は無事。死者は最小限。……上出来よ、007。',
        portrait: 'mendel',
      },
      { kind: 'line', who: 'M', text: '次はモンテネグロ。ル・シッフルという男を、卓の上で潰しなさい。', portrait: 'mendel' },
    ], (_r, c) => {
      c.save.flags['skyfleetSaved'] = true;
      c.save.flags[`p05:${r.style}`] = true;
      writeSave(c.save);
      this.goChapter(c, 'ch00');
    });
  }

  protected override renderBackdrop(ctx: SceneCtx): void {
    super.renderBackdrop(ctx);
    if (!this.playing) return;
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    if (this.phase === 'terminal' && !this.doorOpen) {
      const cx = this.stage.cam.drawX;
      const cy = this.stage.cam.drawY;
      const x = Math.round(P05.door.x - cx);
      const y = Math.round(P05.door.y - cy);
      if (x > -30 && x < GAME_W + 30) {
        const pulse = 0.5 + 0.5 * Math.sin(ctx.time * 3);
        g.strokeStyle = rgba(PAL.AMBER, 0.4 + pulse * 0.4);
        g.setLineDash([3, 3]);
        g.beginPath();
        g.arc(x, y, 20, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        drawText(ui, '施錠 — 解除コード', x, y - 30, {
          size: 6, color: PAL.AMBER, align: 'center', outline: true,
        });
      }
    }

    if (this.phase !== 'chase') return;

    // タンカーとの距離
    drawText(ui, 'タンカーまで', GAME_W / 2, 28, {
      size: 7, color: PAL.GOLD_L, align: 'center', outline: true,
    });
    drawBar(g, GAME_W / 2 - 60, 38, 120, 5, 1 - this.gap / TANKER_RUN, PAL.GOLD, PAL.CHARCOAL);
    drawText(ui, 'Shift で走れ', GAME_W / 2, GAME_H - 30, {
      size: 7, color: rgba(PAL.SILVER, 0.85), align: 'center', outline: true,
    });

    // 前方を走るタンカーの影
    const sway = Math.sin(this.tankerX) * 30;
    const ty = 40 + (this.gap / TANKER_RUN) * 60;
    g.fillStyle = rgba(PAL.CHARCOAL, 0.95);
    g.fillRect(GAME_W / 2 - 22 + sway, ty, 44, 26);
    g.fillStyle = PAL.STEEL;
    g.fillRect(GAME_W / 2 - 22 + sway, ty, 44, 4);
    g.fillStyle = PAL.RED;
    g.fillRect(GAME_W / 2 - 20 + sway, ty + 22, 5, 3);
    g.fillRect(GAME_W / 2 + 15 + sway, ty + 22, 5, 3);
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: src(27) },
          { kind: 'line', who: 'ジェームズ・ボンド', text: 'スカイフリートの初飛行。……人を集めるには、いい日だ。', portrait: 'bond' },
        ], () => this.advance(ctx));
        break;

      case 1:
        this.chooseKit(ctx, 'マイアミ国際空港', '従業員通路は施錠されている。コードは、もう手に入っているはずだ。');
        break;

      case 2:
        this.hintText = '解除コードは、モロカの携帯に残っていた言葉';
        this.waypoint = { x: P05.door.x, y: P05.door.y, label: '従業員用出入口' };
        this.beginRaid(ctx, '従業員通路の扉を開ける');
        break;
    }
  }
}

registerStage('p05', () => new P05Airport());
