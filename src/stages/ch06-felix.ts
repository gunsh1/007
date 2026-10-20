/**
 * 第6章 フィリックス・ライター（原作 L.89〜L.91）
 *
 *  金を失ったボンドは、ル・シッフルを殺すという強硬策に出る。
 *  それを止めたのは CIA のフィリックス・ライター。彼の資金でボンドは卓に戻る。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { money, writeSave } from '../core/save';
import { ChapterScene, drawCasinoHall } from './chapter';
import { registerStage } from './registry';
import { say } from '../game/dialogue';
import { ApproachScene } from '../scenes/approach';
import { hint } from '../data/intel';
import { TableScene } from '../poker/table-scene';
import { TELL_PRESETS } from '../poker/tells';
import { buildTableSeats } from './ch03-casino-night1';
import { applyChipPlan, REBUY } from '../data/chips';
import { src } from '../data/story';

const SB = 250_000;
const BB = 500_000;
const RECOVERY_HANDS = 3;

class Ch06 extends ChapterScene {
  readonly name = 'ch06';
  readonly id: ChapterId = 'ch06';

  protected override renderBackdrop(ctx: SceneCtx): void {
    drawCasinoHall(ctx.display.game, ctx.time);
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: 'ボンドはバーで、テーブルナイフを上着の内側に滑り込ませた。' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '金がないなら、別のやり方で終わらせる。', portrait: 'bond' },
          { kind: 'narr', text: 'ル・シッフルが席を立つ。今しかない。' },
        ], () => this.advance(ctx));
        break;

      case 1:
        // 護衛の視界を避けて、卓のル・シッフルまで詰める。
        ctx.scenes.push(new ApproachScene({
          title: 'ル・シッフルまで詰めろ',
          hintText: hint(ctx, 'chiffre-habit'),
          onDone: (success, c) => {
            c.save.flags['knifeAttempt'] = success;
            this.advance(c);
          },
        }));
        break;

      case 2:
        say(ctx, [
          { kind: 'narr', text: 'ナイフを持つ腕が、横から掴まれた。' },
          { kind: 'narr', text: src(89) },
          { kind: 'line', who: 'フィリックス・ライター', text: 'やめとけ。ここで刺したら、あんたの国もうちの国も終わりだ。', portrait: 'felix' },
          { kind: 'line', who: 'フィリックス・ライター', text: 'フィリックス・ライター。CIAだ。', portrait: 'felix' },
          { kind: 'narr', text: src(91) },
          { kind: 'line', who: 'フィリックス・ライター', text: `${money(REBUY)}出す。あんたが勝て。俺は身柄をもらう。`, portrait: 'felix' },
          {
            kind: 'choice',
            prompt: 'どう答える？',
            options: [
              { id: 'accept', label: '「乗った。身柄は君のものだ」' },
              { id: 'negotiate', label: '「身柄はMI6が先だ」' },
            ],
          },
        ], (r, c) => {
          c.save.felixBacking = true;
          c.save.flags[`felix:${r['last'] ?? 'accept'}`] = true;
          applyChipPlan(c.save, 'ch06');
          writeSave(c.save);
          this.advance(c);
        });
        break;

      case 3:
        ctx.scenes.push(this.makeTable(ctx));
        break;

      case 4:
        say(ctx, [
          { kind: 'narr', text: `ボンドは勝ち続けた。手元は ${money(ctx.save.chips)}。` },
          { kind: 'line', who: 'ヴェスパー・リンド', text: '……戻ってきたわね。', portrait: 'vesper' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: 'いつものマティーニを。ヴェスパーという名前をつけたやつだ。', portrait: 'bond' },
        ], (_r, c) => this.goChapter(c, 'ch07'));
        break;
    }
  }

  private makeTable(ctx: SceneCtx): TableScene {
    return new TableScene({
      title: 'フィリックスの資金で再参加',
      seats: buildTableSeats(ctx.save.chips, ctx.save.chiffreChips, 6_000_000),
      smallBlind: SB,
      bigBlind: BB,
      tells: TELL_PRESETS.ch05,
      music: 'casino',
      maxHands: RECOVERY_HANDS,
      blindUp: { everyHands: 2, factor: 1.4 },
      skip: { hero: 25_000_000, outcome: 'handsDone' },

      onFinish: (c, outcome, scene) => {
        c.scenes.pop();
        c.save.chips = scene.heroChips;
        c.save.chiffreChips = scene.chiffreChips;

        if (outcome === 'heroBust') {
          say(c, [
            { kind: 'narr', text: 'ボンドは再び飛んだ。フィリックスは黙って、もう一度チップを押し出した。' },
            { kind: 'line', who: 'フィリックス・ライター', text: '最後だぞ、007。', portrait: 'felix' },
            { kind: 'fx', run: (cc) => { cc.save.chips = REBUY; } },
          ], () => this.jumpTo(c, 3));
          return;
        }
        // 巻き返しの下限を保証（最終ハンドが成立する額）
        c.save.chips = Math.max(c.save.chips, 20_000_000);
        writeSave(c.save);
        this.jumpTo(c, 4);
      },
    });
  }
}

registerStage('ch06', () => new Ch06());
