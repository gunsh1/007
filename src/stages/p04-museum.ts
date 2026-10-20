/**
 * 前編 第4章 人体の世界展（原作 L.21〜L.25）
 *
 *  展示室でディミトリオスを尾行する。気づかれれば向こうがナイフを抜く。
 *  ここは銃の場所ではない。撃てば客が悲鳴を上げ、彼は逃げる。
 *
 *  攻め方：
 *   ・展示ケースの陰を伝って背後を取る（当て身 → そのまま鞄の鍵を抜く）
 *   ・正面から近づいて、抜かれたナイフを取り返す（近接の刺し合い）
 *   ・撃つ。速いが、鍵を持った男に先に逃げられる
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { GAME_W } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { registerStage } from './registry';
import { MissionChapter } from './mission';
import { GunStage, type GoonDef } from '../game/gunstage';
import { say } from '../game/dialogue';
import { buildMuseum, P04 } from '../data/maps-prologue';
import { src } from '../data/story';

/** 展示を眺める客。撃つと悲鳴が上がる。 */
const CROWD: { x: number; y: number }[] = [
  { x: 120, y: 100 }, { x: 210, y: 96 }, { x: 300, y: 104 },
  { x: 160, y: 180 }, { x: 260, y: 176 }, { x: 380, y: 184 },
  { x: 140, y: 260 }, { x: 300, y: 268 }, { x: 420, y: 250 },
];

class P04Museum extends MissionChapter {
  readonly name = 'p04';
  readonly id: ChapterId = 'p04';
  protected readonly failId = 'p04';

  private done = false;
  private panic = 0;

  constructor() {
    super();
    this.stage = new GunStage({
      map: buildMuseum(),
      spawnX: P04.spawn.x,
      spawnY: P04.spawn.y,
      tint: PAL.PURPLE,
      tintAlpha: 0.14,
      vignette: 0.66,
      hp: 3,
    });
  }

  protected placeGoons(): GoonDef[] {
    return [
      // ディミトリオス。ナイフ持ち。展示室を巡る。
      {
        x: P04.dimitrios.x, y: P04.dimitrios.y, look: 'thug', gun: 'knife', name: 'ディミトリオス',
        patrol: [
          { x: P04.dimitrios.x, y: P04.dimitrios.y },
          { x: 160, y: 96 },
          { x: 160, y: 220 },
          { x: 400, y: 220 },
        ],
      },
      // 私服の護衛
      { x: 96, y: 160, look: 'guestB', gun: 'ppk', patrol: [{ x: 96, y: 130 }, { x: 96, y: 260 }] },
      { x: 400, y: 130, look: 'guestB', gun: 'ppk', facing: Math.PI, sweep: 0.9 },
    ];
  }

  protected override deathLine(): string { return 'ディミトリオスのナイフが先に届いた。'; }

  protected override onRaidUpdate(ctx: SceneCtx, dt: number): void {
    if (this.panic > 0) this.panic -= dt;
    // 銃を撃つと客が騒ぐ
    if (this.stage.lastEvent === 'kill' && this.stage.stats.shots > 0) this.panic = 2.2;

    if (this.done) return;
    const d = this.stage.goons[0];
    if (!d) return;
    if (!d.dead) return;

    this.done = true;
    this.playing = false;
    const r = this.rate();
    ctx.audio.music('none');
    say(ctx, [
      {
        kind: 'narr',
        text: d.knockedOut
          ? '展示ケースの陰で、ディミトリオスは声も出さずに崩れた。'
          : r.shots > 0
            ? '銃声。客が悲鳴を上げて散る。ディミトリオスは倒れた。'
            : src(23),
      },
      { kind: 'narr', text: src(25) },
      { kind: 'line', who: 'ジェームズ・ボンド', text: '鍵がない。……クロークだ。誰かが先に引き出した。', portrait: 'bond' },
      {
        kind: 'line', who: 'M',
        text: r.style === 'ghost'
          ? '博物館で誰も気づかなかった。それでいいのよ、007。'
          : '公共の場よ。次はもう少し考えて。',
        portrait: 'mendel',
      },
    ], (_r, c) => {
      c.save.flags['dimitriosDead'] = !d.knockedOut;
      writeSave(c.save);
      this.goChapter(c, 'p05');
    });
  }

  protected override renderBackdrop(ctx: SceneCtx): void {
    super.renderBackdrop(ctx);
    if (!this.playing) return;
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    const cx = this.stage.cam.drawX;
    const cy = this.stage.cam.drawY;

    // 客（当たり判定はない。雰囲気と、撃った時の後ろめたさのため）
    for (const c of CROWD) {
      const x = Math.round(c.x - cx);
      const y = Math.round(c.y - cy);
      if (x < -20 || x > GAME_W + 20) continue;
      const shift = this.panic > 0 ? Math.round(Math.sin(ctx.time * 18 + c.x) * 3) : 0;
      g.fillStyle = rgba(PAL.SLATE, 0.85);
      g.fillRect(x - 3 + shift, y - 14, 6, 14);
      g.fillStyle = rgba(PAL.SKIN_D, 0.8);
      g.fillRect(x - 2 + shift, y - 18, 4, 4);
    }
    if (this.panic > 0) {
      drawText(ui, '客が逃げ出している', GAME_W / 2, 30, {
        size: 8, color: PAL.RED_L, align: 'center', bold: true, outline: true,
      });
    }
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: src(21) },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '人体の世界展。……悪趣味な待ち合わせ場所だ。', portrait: 'bond' },
          { kind: 'narr', text: 'ここは人が多い。銃を抜けば、それだけで失敗に近い。' },
        ], () => this.advance(ctx));
        break;

      case 1:
        this.chooseKit(ctx, 'マイアミ — 人体の世界展', '人混みの中だ。静かに済ませたいなら、それなりの物を。', {
          hide: ['smoke', 'spare'],
        });
        break;

      case 2:
        this.hintText = '展示ケースの陰なら、視線が通らない';
        this.waypoint = { x: P04.dimitrios.x, y: P04.dimitrios.y, label: 'ディミトリオス' };
        this.beginRaid(ctx, 'ディミトリオスを取る');
        ctx.audio.music('tension');
        break;
    }
  }
}

registerStage('p04', () => new P04Museum());
