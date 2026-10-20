/**
 * エンディング。カジノ編の締めと、暗証番号の伏線回収（原作 L.113〜L.115）。
 * プレイ内容（癖の読み・ヴェスパー信頼度・拷問で口を割ったか）で文面が変わる。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText, wrap } from '../gfx/text';
import { fade, vignette, scanlines, letterbox } from '../gfx/ui';
import { money, writeSave, CHAPTER_ORDER } from '../core/save';
import { PinEntryScene } from './pin-entry';
import { TitleScene } from './title';

interface Beat { t: number; lines: string[]; color?: string; size?: number }

export class EndingScene implements Scene {
  readonly name = 'ending';

  private t = 0;
  private scrollY = 0;
  private beats: Beat[] = [];
  private credits: string[] = [];
  private phase: 'epilogue' | 'credits' | 'done' = 'epilogue';
  /** 送金端末で番号を打ち直すまで、エピローグは始まらない */
  private pinAttempts = 0;

  onEnter(ctx: SceneCtx): void {
    ctx.audio.music('calm');
    ctx.save.unlocked = CHAPTER_ORDER[CHAPTER_ORDER.length - 1]!;
    writeSave(ctx.save);

    // 伏線の回収。第3章で自分が決めた番号を、自分で思い出して打つ。
    // 打ち終わるまでエピローグは始まらない（この間 update は止まっている）。
    ctx.scenes.push(new PinEntryScene({
      mode: 'verify',
      expected: ctx.save.pin || 'VESPER',
      title: 'スイス銀行 — 送金手続き',
      subtitle: `${money(150_000_000)} を動かすには、あなたが登録した番号が要ります`,
      onDone: (_v, c, attempts) => {
        this.pinAttempts = attempts;
        this.t = 0;
        this.build(c);
      },
    }));
  }

  private build(ctx: SceneCtx): void {
    const s = ctx.save;
    const pin = s.pin || 'VESPER';
    const broke = s.flags['brokeUnderTorture'] === true;
    const revived = s.flags['selfRevived'] === true;

    this.beats = [
      { t: 0.0, lines: ['後日。'] },
      {
        t: 3.0,
        lines: [
          '療養中のボンドのもとに、送金手続きのためメンデルがやって来た。',
          `カジノ・ロワイヤルの賞金 ${money(150_000_000)}。`,
        ],
      },
      {
        t: 8.0,
        lines: broke
          ? [
            'ボンドは地下倉庫で番号を口にしていた。',
            'それでも金は動かなかった。ル・シッフルが、それを使う前に死んだからだ。',
          ]
          : [
            'ボンドは最後まで番号を渡さなかった。',
            'ル・シッフルは、それを聞けないまま死んだ。',
          ],
      },
      {
        t: 13.5,
        lines: this.pinAttempts > 1
          ? [
            '端末の前で、ボンドは何度か手を止めた。',
            '',
            `思い出した暗証番号は、「${pin}」。`,
          ]
          : [
            'メンデルの前で、ボンドは迷わず番号を打ち込んだ。',
            '',
            `ボンドが登録した暗証番号は、「${pin}」。`,
          ],
        color: PAL.GOLD_L,
      },
      {
        t: 19.5,
        lines: s.vesper >= 60
          ? ['「今の仕事を辞めてもいいくらい、君のことを愛してる」']
          : ['「……この金は、君が運べ。それが君の仕事だ」'],
        color: PAL.WHITE,
      },
      {
        t: 24.0,
        lines: [
          'モンテネグロは終わった。',
          'だが、ミスター・ホワイトはまだ、ブリーフケースの行方を知っている。',
        ],
      },
      { t: 30.0, lines: ['— カジノ編 完 —'], color: PAL.GOLD, size: 12 },
    ];

    this.credits = [
      '007 CASINO ROYALE',
      'モンテネグロ篇',
      '',
      `暗証番号\t${pin}`,
      `番号の再入力\t${this.pinAttempts <= 1 ? '一度で思い出した' : `${this.pinAttempts}回目で思い出した`}`,
      `最終所持金\t${money(s.chips)}`,
      `ル・シッフルの癖の読み\t${s.tellRead} / 100`,
      `こちらの癖の漏れ\t${s.tellLeak} / 100`,
      `ヴェスパーとの信頼\t${s.vesper} / 100`,
      `除細動器\t${revived ? '自力で押し込んだ' : 'ヴェスパーに救われた'}`,
      `地下倉庫\t${broke ? '口を割った' : '最後まで黙っていた'}`,
      `プレイ時間\t${formatTime(s.playtime)}`,
      '',
      '原作テキスト',
      '007casino.txt（映画『カジノ・ロワイヤル』あらすじ）',
      '',
      'ゲーム化',
      'Vite + TypeScript + Canvas2D',
      'ドット絵・効果音・BGM はすべてコード生成',
      '',
      '[J] タイトルへ',
    ];
  }

  update(ctx: SceneCtx, dt: number): void {
    this.t += dt;
    if (this.phase === 'epilogue') {
      if (this.t > 34 || ctx.input.justPressed('cancel')) {
        this.phase = 'credits';
        this.scrollY = 0;
        ctx.audio.music('tension');
      }
      if (ctx.input.justPressed('light')) this.t += 2.2;
      return;
    }
    if (this.phase === 'credits') {
      this.scrollY += (ctx.input.isDown('light') ? 60 : 16) * dt;
      const total = this.credits.length * 14 + GAME_H;
      if (this.scrollY > total) this.phase = 'done';
      if (ctx.input.justPressed('cancel')) this.phase = 'done';
      return;
    }
    if (ctx.input.justPressed('light') || ctx.input.justPressed('cancel')) {
      ctx.scenes.reset(new TitleScene());
    }
  }

  render(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    g.fillStyle = PAL.VOID;
    g.fillRect(0, 0, GAME_W, GAME_H);

    if (this.phase === 'epilogue') {
      // ヴェネツィアの水面のような、ゆっくり揺れる帯
      for (let i = 0; i < 10; i++) {
        const y = 150 + i * 7;
        const a = 0.05 + 0.03 * Math.sin(this.t * 0.7 + i);
        g.fillStyle = rgba(PAL.TEAL, a);
        g.fillRect(0, y, GAME_W, 3);
      }
      letterbox(g, 28);

      for (const b of this.beats) {
        const age = this.t - b.t;
        if (age < 0 || age > 6.0) continue;
        const a = age < 0.7 ? age / 0.7 : age > 5.0 ? Math.max(0, (6.0 - age) / 1.0) : 1;
        const size = b.size ?? 9;
        const startY = GAME_H / 2 - (b.lines.length * (size + 4)) / 2;
        for (let i = 0; i < b.lines.length; i++) {
          const lines = wrap(ui, b.lines[i]!, GAME_W - 48, size);
          for (let j = 0; j < lines.length; j++) {
            drawText(ui, lines[j]!, GAME_W / 2, startY + (i + j) * (size + 4), {
              size, color: b.color ?? PAL.SILVER, align: 'center', alpha: a, shadow: true,
              bold: b.color === PAL.GOLD,
            });
          }
        }
      }
      vignette(g, 0.7);
      scanlines(g, 0.05);
      drawText(ui, '[J] 早送り  [ESC] スタッフロールへ', GAME_W - 8, GAME_H - 12, {
        size: 6, color: rgba(PAL.STEEL, 0.7), align: 'right',
      });
      return;
    }

    // スタッフロール
    g.fillStyle = rgba(PAL.BLOOD, 0.12);
    g.fillRect(0, 0, GAME_W, GAME_H);
    for (let i = 0; i < this.credits.length; i++) {
      const y = GAME_H + i * 14 - this.scrollY;
      if (y < -16 || y > GAME_H + 8) continue;
      const line = this.credits[i]!;
      // タブ入りの行は「項目 … 値」の2カラムで揃える
      const tab = line.indexOf('\t');
      if (tab >= 0) {
        drawText(ui, line.slice(0, tab), GAME_W / 2 - 6, y, {
          size: 8, color: PAL.STEEL, align: 'right', shadow: true,
        });
        drawText(ui, line.slice(tab + 1), GAME_W / 2 + 6, y, {
          size: 8, color: PAL.WHITE, align: 'left', shadow: true,
        });
        continue;
      }
      const isHeading = i <= 1 || line === '原作テキスト' || line === 'ゲーム化';
      drawText(ui, line, GAME_W / 2, y, {
        size: isHeading ? 10 : 8,
        color: isHeading ? PAL.GOLD_L : PAL.SILVER,
        align: 'center',
        bold: isHeading,
        shadow: true,
      });
    }
    vignette(g, 0.6);
    scanlines(g, 0.05);

    if (this.phase === 'done') {
      fade(g, 0.7);
      drawText(ui, '007', GAME_W / 2, GAME_H / 2 - 16, {
        size: 20, color: PAL.GOLD, align: 'center', bold: true, tracking: 6,
      });
      drawText(ui, '[J] タイトルへ', GAME_W / 2, GAME_H / 2 + 16, {
        size: 8, color: PAL.SILVER, align: 'center',
      });
    }
  }
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0 ? `${h}時間${m}分` : `${m}分${s}秒`;
}
