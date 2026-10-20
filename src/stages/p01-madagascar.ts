/**
 * 前編 第1章 マダガスカル（原作 L.3〜L.9）
 *
 *  爆弾密造人モロカを追ってナムブツ大使館へ押し入る。
 *  兵士に囲まれるが、原作どおり「ガスボンベを撃って、その爆発に紛れて逃げる」が使える。
 *
 *  攻め方：
 *   ・正面から撃ち合う
 *   ・東西の回廊から回り込んで、静かにモロカだけ取る
 *   ・ガスボンベを撃って一気に薙ぐ（音は最大。全員来る）
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { GAME_W } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { registerStage } from './registry';
import { MissionChapter, type MissionRating } from './mission';
import { GunStage, type GoonDef } from '../game/gunstage';
import { say } from '../game/dialogue';
import { buildEmbassy, P01 } from '../data/maps-prologue';
import { src } from '../data/story';
import { dist } from '../game/physics';

interface Tank { x: number; y: number; blown: boolean }

class P01Madagascar extends MissionChapter {
  readonly name = 'p01';
  readonly id: ChapterId = 'p01';
  protected readonly failId = 'p01';

  private tanks: Tank[] = [];
  private caught = false;
  private rating: MissionRating | null = null;
  private ratingT = 0;

  constructor() {
    super();
    this.stage = new GunStage({
      map: buildEmbassy(),
      spawnX: P01.spawn.x,
      spawnY: P01.spawn.y,
      tint: PAL.AMBER,
      tintAlpha: 0.10,
      vignette: 0.62,
    });
  }

  protected placeGoons(): GoonDef[] {
    const g: GoonDef[] = [];
    // モロカ本人（丸腰。逃げ回る）
    g.push({ x: P01.moroka.x, y: P01.moroka.y, look: 'guestB', gun: 'fist', name: 'モロカ', facing: Math.PI / 2, sweep: 1.1 });
    // 執務室の護衛
    g.push({ x: P01.moroka.x - 46, y: P01.moroka.y + 24, look: 'thug', gun: 'smg', facing: Math.PI / 2, sweep: 0.5 });
    g.push({ x: P01.moroka.x + 46, y: P01.moroka.y + 24, look: 'thug', gun: 'ppk', facing: Math.PI / 2, sweep: 0.5 });
    // 中庭の巡回
    g.push({ x: 240, y: 200, look: 'thug', gun: 'shotgun', patrol: [{ x: 200, y: 200 }, { x: 400, y: 200 }, { x: 400, y: 290 }, { x: 200, y: 290 }] });
    g.push({ x: 400, y: 290, look: 'thug', gun: 'smg', patrol: [{ x: 420, y: 300 }, { x: 240, y: 300 }] });
    // 西翼
    g.push({ x: 108, y: 200, look: 'thug', gun: 'ppk', patrol: [{ x: 108, y: 170 }, { x: 108, y: 310 }] });
    // 東翼
    g.push({ x: 492, y: 260, look: 'thug', gun: 'ppk', patrol: [{ x: 492, y: 320 }, { x: 492, y: 160 }] });
    // 南門
    g.push({ x: 268, y: 360, look: 'thug', gun: 'shotgun', facing: -Math.PI / 2, sweep: 0.7 });
    return g;
  }

  protected override deathLine(): string { return '大使館の兵士に囲まれ、撃たれた。'; }

  private resetTanks(): void {
    this.tanks = [
      { x: P01.tank.x, y: P01.tank.y, blown: false },
      { x: P01.tank2.x, y: P01.tank2.y, blown: false },
    ];
  }

  protected override onRaidUpdate(ctx: SceneCtx, dt: number): void {
    if (this.rating) { this.ratingT += dt; return; }

    // ガスボンベ：弾が当たれば爆発し、周囲を巻き込む
    for (const t of this.tanks) {
      if (t.blown) continue;
      const hitIdx = this.stage.bullets.findIndex((b) => dist(b.x, b.y, t.x, t.y) < 9);
      if (hitIdx < 0) continue;
      this.stage.bullets.splice(hitIdx, 1);
      this.blow(ctx, t);
    }

    // モロカを取る（撃っても、当て身でも、触れても捕まえたことになる）
    const moroka = this.stage.goons[0];
    if (!this.caught && moroka) {
      const got = moroka.dead || dist(this.stage.x, this.stage.y, moroka.x, moroka.y) < 20;
      if (got) {
        this.caught = true;
        this.objective = '南の門から逃げろ';
        this.waypoint = { x: P01.spawn.x, y: P01.spawn.y + 40, label: '南門' };
        this.hintText = 'ガスボンベを撃てば、その爆発に紛れられる';
        this.stage.floats.push(this.stage.x, this.stage.y - 26, '鞄を奪った', PAL.GOLD_L, 1.4);
        ctx.audio.sfx('pickup');
        // 全員が気づく（原作どおり囲まれる）
        this.stage.emitNoise(this.stage.x, this.stage.y, 900);
      }
    }

    // 脱出
    if (this.caught && this.stage.y > P01.spawn.y + 30) {
      this.playing = false;
      this.finishRaid(ctx);
    }
  }

  private blow(ctx: SceneCtx, t: Tank): void {
    t.blown = true;
    ctx.audio.sfx('shock');
    ctx.audio.sfx('bodyfall');
    this.stage.cam.shake(9, 0.6);
    this.stage.hitStop = 0.1;
    this.stage.particles.dust(t.x, t.y, 40, PAL.AMBER);
    this.stage.emitNoise(t.x, t.y, 700);
    for (const g of this.stage.liveGoons) {
      if (dist(g.x, g.y, t.x, t.y) < 58) {
        g.kill(Math.atan2(g.y - t.y, g.x - t.x));
        this.stage.stats.kills++;
        this.stage.splatter(g.x, g.y);
      }
    }
    // 自分も近ければ吹き飛ぶ
    if (dist(this.stage.x, this.stage.y, t.x, t.y) < 46) this.stage.takeHit(ctx);
  }

  private finishRaid(ctx: SceneCtx): void {
    this.rating = this.rate();
    const r = this.rating;
    ctx.audio.music('none');
    say(ctx, [
      { kind: 'narr', text: src(5) },
      { kind: 'narr', text: r.style === 'loud' ? src(7) : '騒ぎになる前に、ボンドは塀を越えていた。' },
      { kind: 'narr', text: src(9) },
      { kind: 'line', who: 'ジェームズ・ボンド', text: '「エリプシス」。……人の名前じゃないな。', portrait: 'bond' },
      {
        kind: 'line', who: 'M',
        text: r.style === 'loud'
          ? '大使館を吹き飛ばしたそうね。外交問題よ、007。'
          : '大使館から誰も出てこないわ。……上出来と言っておく。',
        portrait: 'mendel',
      },
    ], (_r, c) => {
      c.save.flags['ellipsis'] = true;
      c.save.flags[`p01:${r.style}`] = true;
      writeSave(c.save);
      this.goChapter(c, 'p02');
    });
  }

  protected override renderBackdrop(ctx: SceneCtx): void {
    super.renderBackdrop(ctx);
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    const cx = this.stage.cam.drawX;
    const cy = this.stage.cam.drawY;

    // ガスボンベ
    for (const t of this.tanks) {
      if (t.blown) continue;
      const x = Math.round(t.x - cx);
      const y = Math.round(t.y - cy);
      if (x < -20 || x > GAME_W + 20) continue;
      g.fillStyle = PAL.AMBER;
      g.fillRect(x - 4, y - 14, 8, 14);
      g.fillStyle = PAL.RED;
      g.fillRect(x - 4, y - 11, 8, 3);
      g.fillStyle = PAL.STEEL;
      g.fillRect(x - 2, y - 17, 4, 3);
      if (this.playing) {
        drawText(ui, 'ガスボンベ', x, y - 26, {
          size: 6, color: rgba(PAL.AMBER, 0.9), align: 'center', outline: true,
        });
      }
    }

    if (this.rating) this.drawRating(ctx, this.rating, this.ratingT);
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: src(3) },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '大使館に逃げ込まれた。……外交特権のある建物に。', portrait: 'bond' },
          { kind: 'line', who: 'M', text: '手を出すなと言ったら、聞くの？', portrait: 'mendel' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '訊かなかったことにします。', portrait: 'bond' },
        ], () => this.advance(ctx));
        break;

      case 1:
        this.chooseKit(ctx, 'マダガスカル — ナムブツ大使館', 'モロカを取って抜ける。中庭にガスボンベがある。');
        break;

      case 2:
        this.resetTanks();
        this.hintText = '中庭のガスボンベは、撃てば爆発する';
        this.waypoint = { x: P01.moroka.x, y: P01.moroka.y, label: 'モロカ' };
        this.beginRaid(ctx, 'モロカを捕らえる');
        break;
    }
  }
}

registerStage('p01', () => new P01Madagascar());
