/**
 * 第0章 ブリーフィング（原作 L.49〜L.55）
 * Mの執務室。カジノ・ロワイヤルの説明を受け、左腕に発信機を打ち込まれる。
 * 移動と「調べる」の練習を兼ねる。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { money } from '../core/save';
import { ExploreChapter } from './explore';
import { registerStage } from './registry';
import { TopDownStage } from '../game/topdown';
import { say } from '../game/dialogue';
import { buildOffice, CH00 } from '../data/maps';
import { src } from '../data/story';
import { askAround } from '../game/gossip';
import { PAL } from '../gfx/palette';

class Ch00 extends ExploreChapter {
  readonly name = 'ch00';
  readonly id: ChapterId = 'ch00';

  constructor() {
    super();
    this.music = 'dread';
    const stage = new TopDownStage({
      map: buildOffice(),
      spawnX: CH00.spawn.x,
      spawnY: CH00.spawn.y,
      tint: PAL.NAVY,
      tintAlpha: 0.14,
      vignette: 0.66,
    });
    stage.player.setLook('bondSuit');
    stage.player.facing = 'up';

    this.setup(
      stage,
      [{ id: 'm', name: 'M（部長）', look: 'mendel', x: CH00.mSeat.x, y: CH00.mSeat.y, facing: 'down' }],
      [
        {
          id: 'dossier',
          x: CH00.dossier.x, y: CH00.dossier.y,
          label: '卓上の資料を読む', guideLabel: '資料の卓', optional: true,
          item: 'dossier', itemName: '作戦資料', itemOffsetY: -14,
          run: (c) => say(c, [
            { kind: 'narr', text: src(49) },
            { kind: 'narr', text: src(51) },
          ]),
        },
        {
          id: 'm',
          x: CH00.desk.x, y: CH00.desk.y, radius: 26,
          label: 'Mと話す', guideLabel: 'Mの執務室', itemName: 'Mの机',
          run: (c) => this.briefing(c),
        },
        {
          id: 'tracker',
          x: CH00.tracker.x, y: CH00.tracker.y,
          label: '左腕に発信機（GPS）を埋め込む', guideLabel: '医務の台',
          item: 'medkit', itemName: '発信機（GPS）', itemOffsetY: -14,
          enabled: (c) => this.doneSpots.has('m') || c.debug.invincible,
          run: (c) => this.tracker(c),
        },
        {
          id: 'window',
          x: CH00.window.x, y: CH00.window.y,
          label: '窓の外を見る', itemName: '窓', optional: true,
          run: (c) => say(c, [
            { kind: 'narr', text: 'テムズの向こうに灯りが並んでいる。あの街のどこかで、誰かが金の勘定をしている。' },
          ]),
        },
      ],
    );
  }

  private briefing(ctx: SceneCtx): void {
    say(ctx, [
      { kind: 'narr', text: src(53) },
      { kind: 'line', who: 'M', text: 'ル・シッフルはテロ組織の金を溶かした。返済のためにモンテネグロの卓に出てくる。', portrait: 'mendel' },
      { kind: 'line', who: 'M', text: `バイ・インは${money(10_000_000)}。追加は${money(5_000_000)}。勝てば${money(150_000_000)}。マフィアの参加者と入れ替わりなさい。`, portrait: 'mendel' },
      { kind: 'line', who: 'M', text: '負ければ、我々はテロ資金を直接供給したことになる。それだけは覚えておきなさい。', portrait: 'mendel' },
      {
        kind: 'choice',
        prompt: 'どう答える？',
        options: [
          { id: 'confident', label: '「負けません」' },
          { id: 'dry', label: '「勝てば、彼は逃げ場を失う」' },
          { id: 'joke', label: '「経費で落ちますか」' },
        ],
      },
    ], (r, c) => {
      if (r['last'] === 'dry') c.save.tellRead = Math.min(100, c.save.tellRead + 5);
      if (r['last'] === 'confident') c.save.tellLeak = Math.min(100, c.save.tellLeak + 5);
      this.debrief(c);
    });
  }

  /**
   * 聞き込み。Mから何を引き出しておくかで、後の章で見えるものが変わる。
   * 訊かなくても進めるが、訊いておくとカジノでの立ち回りが分かる。
   */
  private debrief(ctx: SceneCtx): void {
    askAround(ctx, {
      who: 'M',
      portrait: 'mendel',
      intro: [
        { kind: 'line', who: 'M', text: '……何か訊いておくことは？', portrait: 'mendel' },
      ],
      topics: [
        {
          id: 'chiffre-habit',
          ask: '「ル・シッフルという男は」',
          reply: [
            { kind: 'line', who: 'M', text: '数学者崩れ。感情を顔に出さない訓練を受けている。……ただし、体は別だ。', portrait: 'mendel' },
            { kind: 'line', who: 'M', text: '監視記録によれば、席を立つ前に必ず腕時計を見る。癖というより、儀式ね。', portrait: 'mendel' },
          ],
        },
        {
          id: 'defib',
          ask: '「装備は」',
          reply: [
            { kind: 'line', who: 'M', text: '車に救急キットと除細動器を積ませた。使う羽目にならないことを祈るわ。', portrait: 'mendel' },
            { kind: 'line', who: 'M', text: '技術班からの伝言。端子が緩い。差し込む瞬間だけは、息を止めなさい。', portrait: 'mendel' },
          ],
        },
        {
          id: 'chiffre-fear',
          ask: '「なぜ彼は卓に出てくる」',
          reply: [
            { kind: 'line', who: 'M', text: '溶かした金を、期日までに返さなければならないから。', portrait: 'mendel' },
            { kind: 'line', who: 'M', text: '覚えておきなさい。追われているのは彼のほう。時間がないのも、彼のほうよ。', portrait: 'mendel' },
          ],
        },
      ],
      exhausted: [
        { kind: 'line', who: 'M', text: '……行きなさい、007。', portrait: 'mendel' },
      ],
      onDone: () => { this.objective = '左腕に発信機を埋め込む'; },
    });
  }

  private tracker(ctx: SceneCtx): void {
    say(ctx, [
      { kind: 'narr', text: src(55) },
      { kind: 'narr', text: '左腕に細い針が入る。これで、Mはボンドの位置をいつでも掴める。' },
      { kind: 'fx', run: (c) => { c.save.flags['tracker'] = true; } },
    ], (_r, c) => this.goChapter(c, 'ch01'));
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: 'ロンドン、MI6本部。控えの間から、Mの執務室へ通路が伸びている。' },
          { kind: 'narr', text: 'WASD で移動、E で調べる。\n行き先が分からなくなったら [F] を押せ。目的地までの道が点線で出る。' },
        ], () => this.advance(ctx));
        break;
      case 1:
        this.play(ctx, '通路を抜けてMの執務室へ');
        break;
    }
  }
}

registerStage('ch00', () => new Ch00());
