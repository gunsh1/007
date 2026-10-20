/**
 * 第1章 モンテネグロ行き（原作 L.55〜L.57）
 * 列車内でヴェスパー・リンドと合流。「プロのギャンブラーと富豪令嬢」の設定を作る。
 * ここでの受け答えが、以降のヴェスパー信頼度に効く。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { ExploreChapter } from './explore';
import { registerStage } from './registry';
import { TopDownStage } from '../game/topdown';
import { say } from '../game/dialogue';
import { buildTrain, CH01 } from '../data/maps';
import { src } from '../data/story';
import { askAround } from '../game/gossip';
import { PAL } from '../gfx/palette';

class Ch01 extends ExploreChapter {
  readonly name = 'ch01';
  readonly id: ChapterId = 'ch01';

  constructor() {
    super();
    this.music = 'calm';
    const stage = new TopDownStage({
      map: buildTrain(),
      spawnX: CH01.spawn.x,
      spawnY: CH01.spawn.y,
      tint: PAL.BROWN,
      tintAlpha: 0.10,
      vignette: 0.6,
    });
    stage.player.setLook('bondSuit');
    stage.player.facing = 'right';

    this.setup(
      stage,
      [
        { id: 'vesper', name: 'ヴェスパー・リンド', look: 'vesper', x: CH01.vesper.x, y: CH01.vesper.y, facing: 'down' },
        { id: 'conductor', name: '車掌', look: 'guestB', x: CH01.conductor.x, y: CH01.conductor.y, facing: 'down' },
      ],
      [
        {
          id: 'window',
          x: CH01.windowSpot.x, y: CH01.windowSpot.y,
          label: '車窓を眺める', itemName: '車窓', optional: true,
          run: (c) => say(c, [
            { kind: 'narr', text: '山肌を削った線路を、列車が黒い川沿いに走っていく。モンテネグロまであと三時間。' },
          ]),
        },
        {
          id: 'conductor',
          x: CH01.conductorSpot.x, y: CH01.conductorSpot.y,
          label: '車掌に訊く', itemName: '', optional: true, once: false,
          run: (c) => this.askConductor(c),
        },
        {
          id: 'compartment',
          x: CH01.compartment.x, y: CH01.compartment.y,
          label: '客室を覗く', optional: true,
          item: 'suitcase', itemName: 'スーツケース', itemOffsetY: -12,
          run: (c) => say(c, [
            { kind: 'narr', text: '個室の窓越しに、まだ誰も座っていない席が見える。荷物棚には仕立ての良いスーツケース。' },
            { kind: 'line', who: 'ジェームズ・ボンド', text: '……財務省の人間にしては、趣味がいい。', portrait: 'bond' },
          ]),
        },
        {
          id: 'vesper',
          x: CH01.vesperSpot.x, y: CH01.vesperSpot.y, radius: 26,
          label: '食堂車の女性に話しかける', guideLabel: '食堂車',
          run: (c) => this.meetVesper(c),
        },
      ],
    );
  }

  /** 車掌は地元の人間。道と土地のことを知っている。 */
  private askConductor(ctx: SceneCtx): void {
    askAround(ctx, {
      who: '車掌',
      portrait: 'guestB',
      intro: [
        { kind: 'line', who: '車掌', text: '食堂車は最後尾です。ずっと東へ。……ほかに何か？', portrait: 'guestB' },
      ],
      topics: [
        {
          id: 'road',
          ask: '「モンテネグロの夜道は」',
          reply: [
            { kind: 'line', who: '車掌', text: '街を出ると舗装が切れます。あの辺りは分岐だらけでしてね。', portrait: 'guestB' },
            { kind: 'line', who: '車掌', text: '夜に車を追うなら、埃の舞い方を見ることです。通った側だけ、まだ白く濁っている。', portrait: 'guestB' },
          ],
        },
        {
          id: 'guard-rhythm',
          ask: '「ホテルの客層は」',
          reply: [
            { kind: 'line', who: '車掌', text: 'スプレンディドですか。あそこは要人のボディガードだらけです。', portrait: 'guestB' },
            { kind: 'line', who: '車掌', text: '連中は暇でしてね。グラスを置くたび、周りを一周見回す。癖ですよ。', portrait: 'guestB' },
          ],
        },
      ],
      exhausted: [
        { kind: 'line', who: '車掌', text: '……お客様、そろそろ食堂車が閉まります。', portrait: 'guestB' },
      ],
    });
  }

  private meetVesper(ctx: SceneCtx): void {
    say(ctx, [
      { kind: 'narr', text: src(57) },
      { kind: 'line', who: 'ヴェスパー・リンド', text: 'わたしはお金。金融活動作業部会から来たヴェスパー・リンド。あなたの資金を運ぶ人間よ。', portrait: 'vesper' },
      { kind: 'line', who: 'ヴェスパー・リンド', text: 'それで。あなたはどういう人ということにしておくの？', portrait: 'vesper' },
      {
        kind: 'choice',
        prompt: '「カップル」の設定をどう作る？',
        options: [
          { id: 'gambler', label: '「プロのギャンブラーと、富豪の令嬢」' },
          { id: 'married', label: '「新婚旅行中の夫婦」' },
          { id: 'none', label: '「何も決めない。そのほうが自然だ」' },
        ],
      },
    ], (r, c) => {
      const pick = r['last'] ?? 'gambler';
      c.save.flags[`cover:${pick}`] = true;
      if (pick === 'gambler') {
        c.save.vesper = Math.min(100, c.save.vesper + 12);
        say(c, [
          { kind: 'line', who: 'ヴェスパー・リンド', text: '悪くないわ。負けても言い訳が立つもの。', portrait: 'vesper' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '負ける前提で話すんだな。', portrait: 'bond' },
        ], (_r2, c2) => this.finish(c2));
      } else if (pick === 'married') {
        c.save.vesper = Math.min(100, c.save.vesper + 4);
        say(c, [
          { kind: 'line', who: 'ヴェスパー・リンド', text: '……お断りしたいところだけど、仕事だものね。', portrait: 'vesper' },
        ], (_r2, c2) => this.finish(c2));
      } else {
        c.save.vesper = Math.max(0, c.save.vesper - 6);
        say(c, [
          { kind: 'line', who: 'ヴェスパー・リンド', text: 'それ、いちばん怪しまれるやり方よ。あなた、自分を過信してる。', portrait: 'vesper' },
        ], (_r2, c2) => this.finish(c2));
      }
    });
  }

  private finish(ctx: SceneCtx): void {
    writeSave(ctx.save);
    say(ctx, [
      { kind: 'narr', text: '二人は「ホテル・スプレンディド」に宿泊することになった。' },
    ], (_r, c) => this.goChapter(c, 'ch02'));
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: 'モンテネグロ行きの寝台列車。ボンドは資金の運び手と落ち合うことになっている。' },
          { kind: 'narr', text: '食堂車は最後尾。通路を東へ進め。［F］で道を確認できる。' },
        ], () => this.advance(ctx));
        break;
      case 1:
        this.play(ctx, '最後尾の食堂車で連絡員と合流する');
        break;
    }
  }
}

registerStage('ch01', () => new Ch01());
