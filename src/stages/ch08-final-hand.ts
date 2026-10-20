/**
 * 第8章 最終ハンド（原作 L.97〜L.99）
 *
 *  蘇生したボンドが卓へ戻り、ル・シッフルとの最後の勝負に挑む。
 *  配り札は仕込まない。どちらかが飛ぶまで打ち、勝たなければ先へ進めない。
 *  （原作では 5♠7♠ のストレートフラッシュで決着するが、それは結果であって台本ではない）
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
import { applyChipPlan, PRIZE } from '../data/chips';
import { src } from '../data/story';

const SB = 500_000;
const BB = 1_000_000;
/** 決着がつかないまま延々と続けないための上限 */
const HAND_CAP = 24;

class Ch08 extends ChapterScene {
  readonly name = 'ch08';
  readonly id: ChapterId = 'ch08';
  private attempt = 0;

  protected override renderBackdrop(ctx: SceneCtx): void {
    drawCasinoHall(ctx.display.game, ctx.time);
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        applyChipPlan(ctx.save, 'ch08');
        writeSave(ctx.save);
        say(ctx, [
          { kind: 'narr', text: '心臓を取り戻したボンドは、何事もなかったような顔で卓に戻った。' },
          { kind: 'line', who: 'ル・シッフル', text: '……その顔色で、まだ座るのか。', portrait: 'chiffre' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '席を外していただけだ。続けよう。', portrait: 'bond' },
          { kind: 'narr', text: `勝てば ${money(PRIZE)}。負ければ、テロ組織に金が渡る。\nル・シッフルを飛ばすまで、この卓は終わらない。` },
        ], () => this.advance(ctx));
        break;

      case 1:
        ctx.scenes.push(this.makeTable(ctx));
        break;

      case 2:
        say(ctx, [
          { kind: 'narr', text: src(99) },
          { kind: 'line', who: 'ル・シッフル', text: '……。', portrait: 'chiffre' },
          { kind: 'line', who: 'フィリックス・ライター', text: 'いい勝負だった。身柄の話は、また後でな。', portrait: 'felix' },
          { kind: 'narr', text: 'ポーカーゲームを終えたボンドは、ヴェスパーと一緒に夕食をとることにした。' },
          { kind: 'line', who: 'ヴェスパー・リンド', text: '……あなたに話していないことがあるの。恋人がいるのよ、フランスに。', portrait: 'vesper' },
        ], (_r, c) => this.goChapter(c, 'ch09'));
        break;
    }
  }

  /** 勝った。原作どおり全額を持っていく。 */
  private win(ctx: SceneCtx, heroChips: number): void {
    ctx.save.chips = Math.max(heroChips, PRIZE);
    ctx.save.chiffreChips = 0;
    ctx.save.flags['wonCasinoRoyale'] = true;
    writeSave(ctx.save);
    this.jumpTo(ctx, 2);
  }

  private makeTable(ctx: SceneCtx): TableScene {
    this.attempt++;
    return new TableScene({
      title: this.attempt === 1 ? '最終ハンド' : `最終ハンド（${this.attempt}度目）`,
      seats: buildTableSeats(ctx.save.chips, ctx.save.chiffreChips, 5_000_000),
      smallBlind: SB,
      bigBlind: BB,
      tells: TELL_PRESETS.ch08,
      music: 'dread',
      maxHands: HAND_CAP,
      blindUp: { everyHands: 3, factor: 1.6 },
      skip: { chiffre: 0, outcome: 'chiffreBust' },

      onFinish: (c, outcome, scene) => {
        c.scenes.pop();
        c.save.chips = scene.heroChips;
        c.save.chiffreChips = scene.chiffreChips;

        if (outcome === 'chiffreBust') {
          // 賞金は「卓を制した者」のもの。彼が飛んでも、ボンドが最大でなければ終わらない。
          const rivals = scene.seats.filter((s) => !s.hero).map((s) => s.chips);
          if (scene.heroChips <= Math.max(0, ...rivals)) {
            c.save.chiffreChips = 30_000_000;
            say(c, [
              { kind: 'narr', text: 'ル・シッフルは飛んだ。だが賞金はまだ卓の上にある。彼はもう一度、席を買い直した。' },
            ], () => this.jumpTo(c, 1));
            return;
          }
          const h = scene.lastHand;
          say(c, h?.showdown && h.heroHand ? [
            { kind: 'narr', text: `ボンドの${h.heroHand}。ル・シッフルの前から、最後のチップが消えた。` },
          ] : [
            { kind: 'narr', text: 'ル・シッフルの前から、最後のチップが消えた。' },
          ], (_r, cc) => this.win(cc, scene.heroChips));
          return;
        }

        if (outcome === 'heroBust') {
          // 負けは物語にならない。座り直す。
          say(c, [
            { kind: 'narr', text: 'ボンドのチップが尽きた。ル・シッフルが微かに笑う。' },
            { kind: 'line', who: 'フィリックス・ライター', text: 'まだ席はある。……もう一度だ、007。', portrait: 'felix' },
          ], (_r, cc) => { applyChipPlan(cc.save, 'ch08'); this.jumpTo(cc, 1); });
          return;
        }

        // 打ち切り。卓で一番積んでいれば勝ちとみなす。
        const rivals = scene.seats.filter((s) => !s.hero).map((s) => s.chips);
        if (scene.heroChips > Math.max(0, ...rivals)) { this.win(c, scene.heroChips); return; }
        say(c, [
          { kind: 'narr', text: 'ディーラーが替わる。ル・シッフルはまだ座っている。' },
        ], () => this.jumpTo(c, 1));
      },
    });
  }
}

registerStage('ch08', () => new Ch08());
