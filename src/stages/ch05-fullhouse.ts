/**
 * 第5章 罠（原作 L.79〜L.87）
 *
 *  再開したポーカー。ル・シッフルは癖を読まれていることを察していて、
 *  強い手のときにわざと「ブラフの癖」を出す。それを信じて踏み込めば刺される。
 *
 *  配り札は仕込まない。原作の「フルハウス対フォーカード」は結果の一例であって、
 *  ここで再現するのは局面ではなく仕掛けのほう。
 *  ボンドが飛ぶまで卓は続く。ブラインドが上がっていくので、いつかは必ず飛ぶ。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { money, writeSave } from '../core/save';
import { ChapterScene, drawCasinoHall } from './chapter';
import { registerStage } from './registry';
import { say } from '../game/dialogue';
import { TableScene } from '../poker/table-scene';
import { TELL_PRESETS } from '../poker/tells';
import { buildTableSeats } from './ch03-casino-night1';
import { applyChipPlan, REBUY } from '../data/chips';
import { src } from '../data/story';

const SB = 250_000;
const BB = 500_000;
/** 1回の着席で打つハンド数。飛ばなければ席を立たずに続ける。 */
const HANDS_PER_SITTING = 8;
/** これ以上は粘らせない（現実にはブラインドに焼かれて先に飛ぶ） */
const MAX_SITTINGS = 4;

class Ch05 extends ChapterScene {
  readonly name = 'ch05';
  readonly id: ChapterId = 'ch05';

  private noticedFake = false;
  private trapTold = false;
  private rebought = false;
  private sitting = 0;
  /** 着席をまたいでブラインドを引き継ぐ */
  private sb = SB;
  private bb = BB;

  protected override renderBackdrop(ctx: SceneCtx): void {
    drawCasinoHall(ctx.display.game, ctx.time);
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        applyChipPlan(ctx.save, 'ch05');
        writeSave(ctx.save);
        say(ctx, [
          { kind: 'narr', text: src(79) },
          { kind: 'line', who: 'ル・シッフル', text: '……ずいぶん長い休憩だったな、ミスター・ボンド。', portrait: 'chiffre' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '君ほどじゃない。', portrait: 'bond' },
          { kind: 'narr', text: `手元は ${money(ctx.save.chips)}。ル・シッフルは ${money(ctx.save.chiffreChips)} まで積み上げている。` },
          { kind: 'narr', text: '席を立てるのは、どちらかが飛んだときだけ。ブラインドは上がり続ける。' },
        ], () => this.advance(ctx));
        break;

      case 1:
        ctx.scenes.push(this.makeTable(ctx));
        break;

      case 2:
        say(ctx, [
          { kind: 'narr', text: src(87) },
          { kind: 'line', who: 'ジェームズ・ボンド', text: `追加の${money(REBUY)}を出せ。取り返す。`, portrait: 'bond' },
          { kind: 'line', who: 'ヴェスパー・リンド', text: 'だめよ。これはイギリスの税金。あなたの自尊心のためのお金じゃないわ。', portrait: 'vesper' },
          {
            kind: 'choice',
            prompt: 'どう返す？',
            options: [
              { id: 'admit', label: '「読み違えた。次は違う」' },
              { id: 'push', label: '「君に判断する権限はない」' },
              { id: 'silent', label: '黙って背を向ける' },
            ],
          },
          { kind: 'line', who: 'ヴェスパー・リンド', text: 'その思い上がりと傲慢さを捨てなければ、あなたは負けるわ。', portrait: 'vesper' },
        ], (r, c) => {
          const pick = r['last'] ?? 'push';
          if (pick === 'admit') c.save.vesper = Math.min(100, c.save.vesper + 10);
          else if (pick === 'push') c.save.vesper = Math.max(0, c.save.vesper - 12);
          else c.save.vesper = Math.max(0, c.save.vesper - 4);
          writeSave(c.save);
          this.goChapter(c, 'ch06');
        });
        break;
    }
  }

  /** ボンドが尽きた。原作どおりの結末へ。 */
  private bustOut(ctx: SceneCtx, natural: boolean): void {
    ctx.save.chips = 0;
    ctx.save.chiffreChips = Math.max(ctx.save.chiffreChips, 60_000_000);
    writeSave(ctx.save);
    say(ctx, [
      natural
        ? { kind: 'narr', text: 'ボンドの前から、最後のチップが消えた。' }
        : { kind: 'narr', text: '夜が明けるまでに、ブラインドがボンドの手元を削り切った。' },
      { kind: 'narr', text: src(85) },
    ], (_r, c) => this.jumpTo(c, 2));
  }

  private makeTable(ctx: SceneCtx): TableScene {
    this.sitting++;
    return new TableScene({
      title: this.sitting === 1 ? 'カジノ・ロワイヤル 再開' : `カジノ・ロワイヤル 再開（${this.sitting}）`,
      seats: buildTableSeats(ctx.save.chips, ctx.save.chiffreChips, 8_000_000),
      smallBlind: this.sb,
      bigBlind: this.bb,
      tells: TELL_PRESETS.ch05,
      music: 'tension',
      maxHands: HANDS_PER_SITTING,
      blindUp: { everyHands: 2, factor: 2 },
      tilt: 0.15,
      skip: { hero: 0, outcome: 'heroBust' },

      onTell: (_scene, c, kind) => {
        if (this.noticedFake || kind !== 'fake') return;
        this.noticedFake = true;
        say(c, [
          { kind: 'narr', text: 'ル・シッフルの顔がひきつり、左のこめかみに手が伸びた。第一夜と同じ癖だ。' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: 'ブラフだ。……ここで踏み込む。', portrait: 'bond' },
          { kind: 'narr', text: '［Q］で観察すると「わざとらしさ」に気づけることがある。読みが高いほど見抜ける。' },
        ]);
      },

      onHandEnd: (scene, c) => {
        const h = scene.lastHand;
        if (!h || this.trapTold) return false;
        // 偽の癖を見せられたハンドで大きく持っていかれたら、それが原作の罠
        const bigLoss = -h.heroDelta >= Math.max(scene.bigBlind * 6, 3_000_000);
        if (h.tell !== 'fake' || h.heroDelta >= 0 || h.chiffreDelta <= 0 || !bigLoss) return false;

        this.trapTold = true;
        c.save.flags['trapResolved'] = true;
        say(c, h.showdown ? [
          { kind: 'narr', text: `ボンドの${h.heroHand}に対し、ル・シッフルが開いたのは${h.chiffreHand}。` },
          { kind: 'narr', text: '見せられたのは癖ではなく、餌だった。ブラフの時の癖を読まれていることを、彼は察していたのだ。' },
          { kind: 'line', who: 'ル・シッフル', text: '君は、私の癖をよく見ていた。……見すぎたな。', portrait: 'chiffre' },
        ] : [
          { kind: 'narr', text: `ル・シッフルは手を見せないまま、${money(-h.heroDelta)} をかき集めた。` },
          { kind: 'line', who: 'ル・シッフル', text: '君は、私の癖をよく見ていた。……見すぎたな。', portrait: 'chiffre' },
        ]);
        return false;
      },

      onFinish: (c, outcome, scene) => {
        c.scenes.pop();
        c.save.chips = scene.heroChips;
        c.save.chiffreChips = scene.chiffreChips;
        // 次の着席へブラインドを引き継ぐ
        this.sb = scene.smallBlind;
        this.bb = scene.bigBlind;

        if (outcome === 'heroBust') { this.bustOut(c, true); return; }

        if (outcome === 'chiffreBust') {
          // ここで終わらせるわけにはいかない。彼はテロ資金を回している。
          c.save.chiffreChips = 60_000_000;
          if (this.rebought) { this.jumpTo(c, 1); return; }
          this.rebought = true;
          say(c, [
            { kind: 'narr', text: 'ル・シッフルは電話を一本かけ、新しい札束を卓に積み上げた。' },
            { kind: 'line', who: 'ル・シッフル', text: '……まだ、終わっていない。', portrait: 'chiffre' },
          ], () => this.jumpTo(c, 1));
          return;
        }

        // 飛ばずに打ち切り。粘りすぎたら畳む。
        if (this.sitting >= MAX_SITTINGS) { this.bustOut(c, false); return; }
        say(c, [
          { kind: 'narr', text: `ディーラーが替わる。ブラインドは ${money(this.bb)}。夜はまだ終わらない。` },
        ], () => this.jumpTo(c, 1));
      },
    });
  }
}

registerStage('ch05', () => new Ch05());
