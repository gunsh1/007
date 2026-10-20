/**
 * 第3章 カジノ・ロワイヤル 第一夜（原作 L.65〜L.73）
 *
 *  タキシードで卓へ → メンデルの説明 → 暗証番号の登録 → ポーカー第1セッション
 *  → 途中でル・シッフルの癖に気づく → 4時間後、休憩に入る（第4章へ）
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { money, writeSave } from '../core/save';
import { ChapterScene, drawCasinoHall } from './chapter';
import { registerStage } from './registry';
import { say } from '../game/dialogue';
import { PinEntryScene } from '../scenes/pin-entry';
import { TableScene, CHIFFRE_SEAT, type TableSeatDef } from '../poker/table-scene';
import { LE_CHIFFRE, TABLE_PROFILES } from '../poker/opponents';
import { TELL_PRESETS } from '../poker/tells';
import type { LookName } from '../gfx/actors';

const BUY_IN = 10_000_000;
const SB = 100_000;
const BB = 200_000;
const SESSION_HANDS = 6;

const GUEST_LOOKS: LookName[] = ['guestA', 'guestB', 'guestA', 'guestB', 'felix', 'guestB', 'guestA', 'guestB'];
/** 卓のラベルは幅が狭いので短縮名を使う */
const GUEST_SHORT = ['インファンテ', 'カミノフ', 'トメッリ', 'フクトゥ', 'ライター', 'ブリス', 'ガヤルド', 'パッコウ'];

export function buildTableSeats(heroChips: number, chiffreChips: number, guestChips = BUY_IN): TableSeatDef[] {
  const seats: TableSeatDef[] = [];
  let g = 0;
  for (let i = 0; i < 10; i++) {
    if (i === 0) {
      seats.push({ name: 'ボンド', look: 'bond', profile: null, chips: heroChips });
    } else if (i === CHIFFRE_SEAT) {
      seats.push({ name: 'ル・シッフル', short: 'ル・シッフル', look: 'chiffre', profile: LE_CHIFFRE, chips: chiffreChips });
    } else {
      const p = TABLE_PROFILES[g]!;
      seats.push({ name: p.name, short: GUEST_SHORT[g]!, look: GUEST_LOOKS[g]!, profile: p, chips: guestChips });
      g++;
    }
  }
  return seats;
}

class Ch03 extends ChapterScene {
  readonly name = 'ch03';
  readonly id: ChapterId = 'ch03';
  private noticedTell = false;

  protected override renderBackdrop(ctx: SceneCtx): void {
    drawCasinoHall(ctx.display.game, ctx.time);
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        // 第一夜の開始時点では全員がバイ・インのぶんだけ持っている
        ctx.save.chips = BUY_IN;
        ctx.save.chiffreChips = BUY_IN;
        say(ctx, [
          { kind: 'narr', text: 'その日の夜。ボンドはヴェスパーが用意したオーダーメイドのタキシードを着て、カジノ・ロワイヤルに向かった。' },
          { kind: 'line', who: 'ヴェスパー・リンド', text: 'その服を着ているあなたを見て、みんなが値踏みするわ。せいぜい、それに見合う男でいて。', portrait: 'vesper' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '努力しよう。', portrait: 'bond' },
        ], () => this.advance(ctx));
        break;

      case 1:
        say(ctx, [
          { kind: 'narr', text: 'ル・シッフルやボンドら参加者は、賭け金を管理するスイス銀行の行員メンデルから説明を受けた。' },
          { kind: 'line', who: 'メンデル', text: 'ゲームの参加者はまず、暗証番号をご登録をしてもらいます。', portrait: 'mendel' },
          { kind: 'line', who: 'メンデル', text: '勝者が登録した自身の暗証番号を入力すれば、我々スイス銀行は世界中どこでも、ご指定の口座に1億5000万ドルを送金いたします。', portrait: 'mendel' },
        ], () => this.advance(ctx));
        break;

      case 2:
        ctx.scenes.push(new PinEntryScene({
          mode: 'register',
          onDone: (pin, c) => {
            c.save.pin = pin;
            writeSave(c.save);
            this.advance(c);
          },
        }));
        break;

      case 3:
        say(ctx, [
          { kind: 'line', who: 'メンデル', text: `登録いたしました。「${ctx.save.pin}」ですね。`, portrait: 'mendel' },
          { kind: 'line', who: 'メンデル', text: 'この番号は控えません。忘れれば、賞金は誰のものにもなりません。……よく覚えておいてください。', portrait: 'mendel' },
          { kind: 'line', who: 'ル・シッフル', text: '……はじめようか、ミスター・ボンド。', portrait: 'chiffre' },
          { kind: 'narr', text: `バイ・インは1000万ドル。追加は500万ドル。勝てば1億5000万ドル。\n[Q]で相手を観察できる。ル・シッフルから目を離すな。` },
        ], () => this.advance(ctx));
        break;

      case 4:
        ctx.scenes.push(this.makeTable(ctx));
        break;

      case 5:
        say(ctx, [
          { kind: 'narr', text: `ゲーム開始から4時間後、1時間の休憩を挟むことになった。\n手元は ${money(ctx.save.chips)}。` },
          { kind: 'line', who: 'ルネ・マティス', text: 'ル・シッフルが部屋に戻った。……様子がおかしい。', portrait: 'mathis' },
        ], () => this.goChapter(ctx, 'ch04'));
        break;
    }
  }

  private makeTable(ctx: SceneCtx): TableScene {
    return new TableScene({
      title: 'カジノ・ロワイヤル 第一夜',
      seats: buildTableSeats(ctx.save.chips || BUY_IN, ctx.save.chiffreChips || BUY_IN),
      smallBlind: SB,
      bigBlind: BB,
      tells: TELL_PRESETS.ch03,
      music: 'casino',
      maxHands: SESSION_HANDS,
      blindUp: { everyHands: 3, factor: 1.5 },
      forceFirstTell: true,
      skip: { outcome: 'handsDone' },

      onTell: (_scene, c, kind) => {
        if (this.noticedTell || kind !== 'genuine') return;
        this.noticedTell = true;
        say(c, [
          { kind: 'narr', text: 'ル・シッフルの顔が、わずかにひきつった。左のこめかみに手が伸びる。' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '……見えた。ブラフのときの癖だ。', portrait: 'bond' },
          { kind: 'narr', text: '[Q]を押している間、相手を観察できる。癖を見抜けば「読み」が上がっていく。' },
          { kind: 'fx', run: (cc) => { cc.save.tellRead = Math.max(cc.save.tellRead, 25); } },
        ]);
      },

      onFinish: (c, outcome, scene) => {
        c.scenes.pop();
        c.save.chips = scene.heroChips;
        c.save.chiffreChips = scene.chiffreChips;
        writeSave(c.save);

        if (outcome === 'heroBust') {
          say(c, [
            { kind: 'narr', text: 'ボンドは持ち金を失った。ヴェスパーが追加の資金を渋々差し出す。' },
            { kind: 'line', who: 'ヴェスパー・リンド', text: 'これが最後よ。次は自分の頭で勝ちなさい。', portrait: 'vesper' },
            { kind: 'fx', run: (cc) => { cc.save.chips = BUY_IN; } },
          ], () => this.jumpTo(c, 4));
          return;
        }
        this.jumpTo(c, 5);
      },
    });
  }
}

registerStage('ch03', () => new Ch03());
