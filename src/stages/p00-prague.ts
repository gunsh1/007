/**
 * 前編 第0章 プラハ（原作 L.1）
 *
 *  MI6を裏切った支局長を殺せば、00 が手に入る。
 *  導入なので敵は少ない。マウスで狙い、クリックで撃つことだけを覚える。
 *
 *  攻め方は縛らない。
 *   ・廊下を正面から行って、途中の相棒（裏切者の片割れ）を撃つ
 *   ・給湯室から回り込んで、背後から当て身
 *   ・そもそも誰にも会わずに局長室へ入る
 *  どれでも 00 にはなる。Mの評価だけが変わる。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { PAL } from '../gfx/palette';
import { registerStage } from './registry';
import { MissionChapter, type MissionRating } from './mission';
import { GunStage, type GoonDef } from '../game/gunstage';
import { say } from '../game/dialogue';
import { buildPrague, P00 } from '../data/maps-prologue';
import { src } from '../data/story';
import { dist } from '../game/physics';

class P00Prague extends MissionChapter {
  readonly name = 'p00';
  readonly id: ChapterId = 'p00';
  protected readonly failId = 'p00';

  private ratingT = 0;
  private rating: MissionRating | null = null;
  private chiefDown = false;

  constructor() {
    super();
    this.stage = new GunStage({
      map: buildPrague(),
      spawnX: P00.spawn.x,
      spawnY: P00.spawn.y,
      tint: PAL.STEEL,
      tintAlpha: 0.10,
      vignette: 0.58,
      monochrome: true,
    });
  }

  protected placeGoons(): GoonDef[] {
    return [
      // 廊下を行き来する相棒
      {
        x: P00.door.x, y: P00.door.y, look: 'thug', gun: 'ppk', name: '局長の相棒',
        patrol: [{ x: 96, y: 148 }, { x: 344, y: 148 }],
      },
      // 給湯室の見張り
      { x: 264, y: 216, look: 'guestB', gun: 'fist', facing: Math.PI, sweep: 0.9 },
      // 局長室の前
      { x: P00.office.x - 20, y: P00.office.y + 70, look: 'thug', gun: 'ppk', facing: -Math.PI / 2, sweep: 0.5 },
    ];
  }

  protected override deathLine(): string { return '撃たれた。00 はまだ遠い。'; }

  protected override onRaidUpdate(ctx: SceneCtx, dt: number): void {
    if (this.rating) { this.ratingT += dt; return; }

    // 局長の机へ到達すれば任務完了（撃ったかどうかは問わない）
    if (!this.chiefDown && dist(this.stage.x, this.stage.y, P00.desk.x, P00.desk.y) < 26) {
      this.chiefDown = true;
      this.playing = false;
      this.finishRaid(ctx);
    }
  }

  private finishRaid(ctx: SceneCtx): void {
    this.rating = this.rate();
    const r = this.rating;
    ctx.audio.music('none');
    say(ctx, [
      { kind: 'narr', text: '机の向こうで、支局長が銃を抜こうとして――やめた。' },
      { kind: 'line', who: '支局長', text: '……二人目か。一人目はどうした。', portrait: 'mendel' },
      {
        kind: 'line', who: 'ジェームズ・ボンド',
        text: r.kills > 0 ? '考えるより先に撃った。……あんたよりは速かった。' : '眠っている。あんたと違って、あれは金で動いただけだ。',
        portrait: 'bond',
      },
      { kind: 'narr', text: '一発。' },
      { kind: 'narr', text: src(1) },
      {
        kind: 'line', who: 'M',
        text: r.style === 'ghost'
          ? '誰にも見られず、誰も殺さずに入った。……悪くないわ、007。'
          : r.style === 'quiet'
            ? '必要なぶんだけ撃った。それが 00 の意味よ。'
            : `${r.kills}人。二人で済んだはずの仕事にしては、派手すぎるわね。`,
        portrait: 'mendel',
      },
    ], (_r, c) => {
      c.save.flags['licence'] = true;
      c.save.flags[`p00:${r.style}`] = true;
      writeSave(c.save);
      this.goChapter(c, 'p01');
    });
  }

  protected override renderBackdrop(ctx: SceneCtx): void {
    super.renderBackdrop(ctx);
    if (this.rating) this.drawRating(ctx, this.rating, this.ratingT);
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: 'チェコ、プラハ。MI6 支局の夜。' },
          { kind: 'narr', text: '支局長は組織を売った。彼を殺せば「00」が手に入る。二人目の標的だ。' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '一人目は、思ったより手こずった。', portrait: 'bond' },
          { kind: 'narr', text: 'マウスで銃口を向け、クリックで撃つ。WASD で歩く。' },
          { kind: 'narr', text: '相手は一発で倒れる。こちらも同じだ。撃ち合うな、先に見つけろ。' },
          { kind: 'narr', text: '背後から [E] は当て身。殺さずに寝かせられる。銃声も立たない。' },
        ], () => this.advance(ctx));
        break;

      case 1:
        this.chooseKit(ctx, 'プラハ — 支局長', '持ち込めるのは3つ。ここから先は自分で決める。', {
          hide: ['tracker', 'smoke', 'picks'],
        });
        break;

      case 2:
        this.hintText = '廊下を行くか、給湯室から回るか';
        this.waypoint = { x: P00.desk.x, y: P00.desk.y, label: '局長室' };
        this.beginRaid(ctx, '支局長の机まで辿り着く');
        break;
    }
  }
}

registerStage('p00', () => new P00Prague());
