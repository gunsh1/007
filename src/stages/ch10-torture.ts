/**
 * 第10章 地下倉庫（原作 L.107〜L.111）
 *
 *  拘束されたボンドに、ル・シッフルが暗証番号を吐かせようとする。
 *  連打ではなく「呼吸」のゲーム。
 *
 *   ・ロープが振られてから当たるまでの間に、当たる瞬間へ [J] を合わせて息を吐く
 *   ・合えば衝撃を逃がせる。外せば意志が大きく削られる
 *   ・[Q] で振りかぶりを凝視すると当たる瞬間の印が出るが、
 *     息が浅くなって受け入れの幅が狭まる
 *   ・[C] で息を止めると、吐くのを一拍こらえられる（幅が後ろへ伸びる）。
 *     肺が空になると喘いで、次の一撃は必ずまともに入る
 *   ・耐えるほどル・シッフルが焦る。焦りきらせれば、こちらの勝ち
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawBar, vignette, scanlines, letterbox, flash } from '../gfx/ui';
import { drawHint } from '../gfx/minigame-hud';
import { ChapterScene } from './chapter';
import { registerStage } from './registry';
import { say } from '../game/dialogue';
import { anims } from '../gfx/actors';
import { drawArmlessChair } from '../gfx/props';
import { Particles } from '../game/fx';
import { Breath } from '../game/breath';
import { hint } from '../data/intel';
import { assist, recordFail, clearFails } from '../game/assist';
import { Rng } from '../core/rng';
import { src } from '../data/story';
import { EndingScene } from '../scenes/ending';

/** 焦りきらせれば勝ち。耐えるだけの回数上限も置く。 */
const IMPATIENCE_WIN = 100;
const MAX_BLOWS = 12;

/** 息を吐く受け入れ幅（秒・片側） */
const WINDOW = 0.17;
/** [Q] で凝視している間は浅くなる */
const WINDOW_WATCHING = 0.6;
/** [C] で止めていると後ろへ伸びる */
const WINDOW_HELD_LATE = 0.15;

const CHAIR_X = 148;
const CHAIR_Y = 122;
const CHIFFRE_X = 238;

const FAIL_ID = 'ch10-endure';

type Phase = 'idle' | 'windup' | 'impact' | 'between' | 'broke' | 'white';

class Ch10 extends ChapterScene {
  readonly name = 'ch10';
  readonly id: ChapterId = 'ch10';

  private phase: Phase = 'idle';
  private blow = 0;
  private t = 0;
  private resolve = 100;
  private impatience = 0;
  private taunts = 0;
  private begs = 0;
  private shake = 0;
  private hitT = 0;
  private particles = new Particles();
  private playing = false;
  private whiteT = 0;
  private rng = new Rng(0x10_c0_de);

  private breath = new Breath(0.55, 0.30, 1.6);
  /** この一撃が当たるまでの時間 */
  private windupTime = 1.5;
  /** 既に息を吐いたか */
  private exhaled = false;
  /** 吐いた瞬間のずれ（秒）。判定表示に使う。 */
  private lastOffset = 0;
  private verdict: 'good' | 'late' | 'miss' | null = null;
  private verdictT = 0;
  /** 凝視していたか（この一撃で） */
  private watched = false;

  // ── 進行 ────────────────────────────────────────────────────

  private startBlow(ctx: SceneCtx): void {
    this.phase = 'windup';
    this.t = 0;
    this.exhaled = false;
    this.watched = false;
    // 打撃は回を追うごとに速くなる。煽るとさらに速い。
    const base = 1.65 - this.blow * 0.07 - this.taunts * 0.09;
    this.windupTime = Math.max(0.62, base) * (1 + assist(FAIL_ID) * 0.5) + this.rng.float(-0.12, 0.12);
    ctx.audio.sfx('tick', 0.5);
  }

  private get window(): number {
    let w = WINDOW * (1 + assist(FAIL_ID));
    if (this.watched) w *= WINDOW_WATCHING;
    return w;
  }

  override update(ctx: SceneCtx, dt: number): void {
    super.update(ctx, dt);
    if (!this.playing) return;

    this.t += dt;
    if (this.shake > 0) this.shake -= dt;
    if (this.hitT > 0) this.hitT -= dt * 2.5;
    if (this.verdictT > 0) this.verdictT -= dt;
    this.particles.update(dt);

    if (this.phase === 'white') { this.whiteT += dt; return; }
    if (this.phase !== 'windup' && this.phase !== 'impact') return;

    const held = this.breath.update(dt, ctx.input.isDown('steady'));
    if (ctx.input.isDown('observe')) this.watched = true;

    if (this.phase === 'windup') {
      // 息を吐く
      if (!this.exhaled && ctx.input.justPressed('light')) {
        this.exhaled = true;
        this.lastOffset = this.t - this.windupTime;
        ctx.audio.sfx('whiff', 1.3);
      }
      if (this.t >= this.windupTime) this.resolveBlow(ctx, held);
      return;
    }

    // 当たった直後の間。ここで結末が決まる。
    if (this.phase === 'impact' && this.t > 0.55) this.afterBlow(ctx);
  }

  /** 一撃のあと。倒れるか、相手が折れるか、次の一撃か。 */
  private afterBlow(ctx: SceneCtx): void {
    if (this.resolve <= 0) { this.breakDown(ctx); return; }
    if (this.impatience >= IMPATIENCE_WIN || this.blow >= MAX_BLOWS) { this.survive(ctx); return; }
    if (this.blow % 3 === 0) {
      this.phase = 'between';
      this.playing = false;
      this.interlude(ctx);
      return;
    }
    this.startBlow(ctx);
  }

  /** 一撃の判定 */
  private resolveBlow(ctx: SceneCtx, held: boolean): void {
    this.phase = 'impact';
    this.t = 0;
    this.hitT = 1;
    this.shake = 0.22;
    this.particles.hitSpark(CHAIR_X, CHAIR_Y - 20, PAL.BLOOD);
    ctx.audio.sfx('punch', 0.75);

    const w = this.window;
    const lateAllowance = held ? WINDOW_HELD_LATE : 0;
    const off = this.exhaled ? this.lastOffset : Infinity;
    const gasping = this.breath.gasping;

    let ok = false;
    if (!gasping && this.exhaled) {
      ok = off >= -w && off <= w + lateAllowance;
    }

    if (ok) {
      this.verdict = Math.abs(off) < w * 0.45 ? 'good' : 'late';
      this.resolve = Math.max(0, this.resolve - 3);
      this.impatience = Math.min(IMPATIENCE_WIN, this.impatience + 13 + this.taunts * 2);
      ctx.audio.sfx('dodge', 1.2);
    } else {
      this.verdict = 'miss';
      const dmg = 13 + this.blow * 1.6 + (gasping ? 6 : 0);
      this.resolve = Math.max(0, this.resolve - dmg);
      this.impatience = Math.max(0, this.impatience - 4);
      this.shake = 0.4;
      ctx.audio.sfx('hit');
      this.particles.blood(CHAIR_X, CHAIR_Y - 18, -1, 0);
    }
    this.verdictT = 1.1;
    this.blow++;
    // 続きは afterBlow（当たった余韻を見せてから進める）
  }

  private interlude(ctx: SceneCtx): void {
    const lines = [
      'ル・シッフルはロープの結び目を握り直した。',
      '汗が床に落ちる音がやけに大きい。',
      'ル・シッフルの手が止まる。焦っているのは、こちらではない。',
      '彼は時計を見た。二度目だ。',
    ];
    say(ctx, [
      { kind: 'narr', text: lines[Math.min(lines.length - 1, Math.floor(this.blow / 3) - 1)] ?? lines[0]! },
      { kind: 'line', who: 'ル・シッフル', text: '暗証番号だ。それだけでいい。そうすれば終わる。', portrait: 'chiffre' },
      {
        kind: 'choice',
        prompt: 'どうする？',
        options: [
          { id: 'taunt', label: '「もっと強く打て。右に寄ってるぞ」' },
          { id: 'silent', label: '黙って呼吸を整える' },
          { id: 'beg', label: '「……やめてくれ」' },
        ],
      },
    ], (r, c) => {
      const pick = r['last'] ?? 'silent';
      if (pick === 'taunt') {
        // 相手は速く振るようになるが、焦りが乗る
        this.taunts++;
        this.impatience = Math.min(IMPATIENCE_WIN, this.impatience + 10);
        this.resolve = Math.min(100, this.resolve + 8);
        say(c, [
          { kind: 'line', who: 'ル・シッフル', text: '……愉快な男だ。だが、そのうち笑えなくなる。', portrait: 'chiffre' },
        ], (_r2, c2) => { this.playing = true; this.breath.reset(); this.startBlow(c2); });
      } else if (pick === 'beg') {
        this.begs++;
        this.resolve = Math.min(100, this.resolve + 20);
        this.impatience = Math.max(0, this.impatience - 16);
        if (this.begs >= 3) { this.playing = true; this.breakDown(c); return; }
        say(c, [
          { kind: 'line', who: 'ル・シッフル', text: 'そう、それでいい。あと少しだ。', portrait: 'chiffre' },
        ], (_r2, c2) => { this.playing = true; this.breath.reset(); this.startBlow(c2); });
      } else {
        this.resolve = Math.min(100, this.resolve + 14);
        this.breath.reset();
        this.playing = true;
        this.startBlow(c);
      }
    });
  }

  private breakDown(ctx: SceneCtx): void {
    this.phase = 'broke';
    this.playing = false;
    recordFail(FAIL_ID);
    ctx.save.flags['brokeUnderTorture'] = true;
    writeSave(ctx.save);
    say(ctx, [
      { kind: 'narr', text: '喉が勝手に動いた。ボンドは、登録した文字列を口にしてしまう。' },
      { kind: 'line', who: 'ジェームズ・ボンド', text: `……「${ctx.save.pin || 'VESPER'}」だ。`, portrait: 'bond' },
      { kind: 'line', who: 'ル・シッフル', text: 'ありがとう、ミスター・ボンド。あとは口座番号だけだ。彼女から聞き出せばいい。', portrait: 'chiffre' },
    ], (_r, c) => this.mrWhite(c));
  }

  private survive(ctx: SceneCtx): void {
    this.playing = false;
    clearFails(FAIL_ID);
    ctx.save.flags['brokeUnderTorture'] = false;
    writeSave(ctx.save);
    say(ctx, [
      { kind: 'narr', text: 'ロープを持つ手が止まった。息を切らしているのは、殴っているほうだった。' },
      { kind: 'line', who: 'ジェームズ・ボンド', text: '……もう、掻いてくれないのか。ちょうど良かったんだが。', portrait: 'bond' },
      { kind: 'line', who: 'ル・シッフル', text: '……君は本当に、頭がおかしい。', portrait: 'chiffre' },
    ], (_r, c) => this.mrWhite(c));
  }

  private mrWhite(ctx: SceneCtx): void {
    this.phase = 'white';
    this.whiteT = 0;
    this.playing = true;
    ctx.audio.music('none');
    ctx.audio.sfx('door');
    say(ctx, [
      { kind: 'narr', text: '地下倉庫の扉が開いた。足音は、ひとつ。' },
      { kind: 'narr', text: src(111) },
      { kind: 'line', who: 'ミスター・ホワイト', text: '金よりも信頼できん奴はこうする。', portrait: 'white' },
      { kind: 'fx', run: (c) => { c.audio.sfx('gunshot'); this.shake = 0.8; this.particles.blood(CHIFFRE_X, 120, 0, 1); } },
      { kind: 'wait', seconds: 1.2 },
      { kind: 'narr', text: 'ル・シッフルは崩れ落ちた。ミスター・ホワイトは、ボンドを一瞥もせずに背を向ける。' },
    ], (_r, c) => {
      c.save.flags['chiffreDead'] = true;
      writeSave(c.save);
      c.scenes.reset(new EndingScene());
    });
  }

  // ── 描画 ────────────────────────────────────────────────────

  protected override renderBackdrop(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    const sx = this.shake > 0 ? Math.round(Math.sin(ctx.time * 90) * this.shake * 7) : 0;
    const sy = this.shake > 0 ? Math.round(Math.cos(ctx.time * 77) * this.shake * 5) : 0;
    g.save();
    g.translate(sx, sy);

    // 地下倉庫
    g.fillStyle = '#0c0d10';
    g.fillRect(-8, -8, GAME_W + 16, GAME_H + 16);
    g.fillStyle = '#23272f';
    g.fillRect(-8, 72, GAME_W + 16, GAME_H);
    g.fillStyle = '#191d24';
    for (let x = -8; x < GAME_W + 8; x += 16) g.fillRect(x, 72, 1, GAME_H);
    for (let y = 80; y < GAME_H; y += 12) g.fillRect(-8, y, GAME_W + 16, 1);
    g.fillStyle = '#2e333c';
    g.fillRect(-8, 68, GAME_W + 16, 4);

    const flick = 0.8 + 0.2 * Math.sin(ctx.time * 11) * Math.sin(ctx.time * 3.3);
    g.fillStyle = rgba(PAL.GOLD_L, flick);
    g.fillRect(190, 22, 3, 3);
    g.fillStyle = rgba(PAL.SILVER, 0.4);
    g.fillRect(191, 0, 1, 22);
    const lamp = g.createRadialGradient(191, 24, 6, 191, 24, 150);
    lamp.addColorStop(0, rgba(PAL.GOLD_L, 0.26 * flick));
    lamp.addColorStop(1, rgba(PAL.GOLD_L, 0));
    g.fillStyle = lamp;
    g.fillRect(0, 0, GAME_W, GAME_H);

    // 椅子とボンド
    drawArmlessChair(g, CHAIR_X, CHAIR_Y);
    const bond = anims('bond').seated;
    // 息を止めている間は身体が固まる
    const sway = this.phase === 'windup' && !this.breath.held ? Math.sin(ctx.time * 5) * 1 : 0;
    bond.draw(g, CHAIR_X + sway, CHAIR_Y - 12);
    if (this.hitT > 0) bond.drawSilhouette(g, CHAIR_X + sway, CHAIR_Y - 12, PAL.RED_L);

    // ル・シッフル
    const chiffre = anims('chiffre').idle.side.frames[0]!;
    const wind = this.phase === 'windup' ? Math.min(1, this.t / Math.max(0.01, this.windupTime)) : 0;
    const step = this.phase === 'windup' ? -Math.sin(wind * Math.PI) * 5 : 0;
    if (this.phase !== 'white' || this.whiteT < 1.4) {
      chiffre.draw(g, CHIFFRE_X + step, CHAIR_Y - 2, false);
    } else {
      anims('chiffre').downed.frames[0]!.draw(g, CHIFFRE_X, CHAIR_Y - 2);
    }
    // ロープ。振りかぶりに合わせて後ろへ引かれ、当たる瞬間に戻る。
    if (this.phase === 'windup' || this.phase === 'impact') {
      const swing = this.phase === 'windup' ? Math.sin(wind * Math.PI) * 22 : -4;
      g.strokeStyle = '#6b5a3c';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(CHIFFRE_X - 6, CHAIR_Y - 22);
      g.lineTo(CHAIR_X + 22 + swing, CHAIR_Y - 12);
      g.stroke();
      g.fillStyle = '#8a7450';
      g.fillRect(Math.round(CHAIR_X + 20 + swing), CHAIR_Y - 15, 4, 4);
    }

    if (this.phase === 'white') {
      const wx = 340 - Math.min(80, this.whiteT * 60);
      anims('white').idle.side.frames[0]!.draw(g, wx, CHAIR_Y - 2, true);
    }

    this.particles.draw(g, 0, 0);
    g.restore();

    letterbox(g, 20);
    vignette(g, 0.58);
    if (this.hitT > 0) flash(g, this.hitT * 0.3, PAL.BLOOD);
    scanlines(g, 0.07);

    if (!this.playing || this.phase === 'white') return;

    this.drawHud(ctx, g, ui);
  }

  private drawHud(ctx: SceneCtx, g: CanvasRenderingContext2D, ui: CanvasRenderingContext2D): void {
    // 意志
    drawText(ui, '意志', 20, 24, {
      size: 7, color: this.resolve > 35 ? PAL.GOLD_L : PAL.RED_L, outline: true,
    });
    drawBar(g, 20, 33, 100, 6, this.resolve / 100, this.resolve > 35 ? PAL.GOLD : PAL.RED_L, PAL.CHARCOAL);

    // ル・シッフルの焦り。満たせば勝ち。
    drawText(ui, 'ル・シッフルの焦り', GAME_W - 20, 24, {
      size: 7, color: PAL.RED_L, align: 'right', outline: true,
    });
    drawBar(g, GAME_W - 120, 33, 100, 6, this.impatience / IMPATIENCE_WIN, PAL.RED, PAL.CHARCOAL);

    // 呼吸のタイミングバー
    if (this.phase === 'windup' || this.phase === 'impact') {
      const barW = 180;
      const bx = GAME_W / 2 - barW / 2;
      const by = 54;
      const w = this.window;
      const late = this.breath.held ? WINDOW_HELD_LATE : 0;

      g.fillStyle = rgba(PAL.VOID, 0.8);
      g.fillRect(bx - 2, by - 2, barW + 4, 14);

      // 受け入れ幅
      const total = this.windupTime + 0.35;
      const toX = (sec: number): number => bx + (sec / total) * barW;
      g.fillStyle = rgba(PAL.GOLD, 0.30);
      g.fillRect(toX(this.windupTime - w), by, Math.max(2, toX(w * 2 + late) - toX(0)), 10);

      // 進行
      g.fillStyle = rgba(PAL.SILVER, 0.25);
      g.fillRect(bx, by + 4, barW, 2);
      const px = Math.round(toX(Math.min(this.t, total)));
      g.fillStyle = this.exhaled ? PAL.STEEL : PAL.WHITE;
      g.fillRect(px - 1, by, 2, 10);

      // 当たる瞬間。[Q] で凝視している時だけはっきり出る。
      const ix = Math.round(toX(this.windupTime));
      if (this.watched) {
        g.fillStyle = PAL.RED_L;
        g.fillRect(ix - 1, by - 3, 3, 16);
      } else {
        g.fillStyle = rgba(PAL.RED, 0.35);
        g.fillRect(ix, by + 2, 1, 6);
      }

      drawText(ui, this.exhaled ? '息を吐いた' : '[J] 当たる瞬間に息を吐け', GAME_W / 2, by - 12, {
        size: 7, color: this.exhaled ? PAL.STEEL : PAL.WHITE, align: 'center', outline: true,
      });
    }

    // 肺
    const air = this.breath.air;
    drawText(ui, this.breath.gasping ? '喘いでいる' : this.breath.held ? '息を止めている' : '[C] 息を止める / [Q] 凝視', 20, GAME_H - 34, {
      size: 6,
      color: this.breath.gasping ? PAL.RED_L : this.breath.held ? PAL.GOLD_L : rgba(PAL.SILVER, 0.7),
      outline: true,
    });
    drawBar(g, 20, GAME_H - 25, 80, 4, air, this.breath.gasping ? PAL.RED_L : PAL.TEAL, PAL.CHARCOAL);

    // 判定
    if (this.verdictT > 0 && this.verdict) {
      const label = this.verdict === 'good' ? '受け流した' : this.verdict === 'late' ? 'かろうじて' : 'まともに入った';
      const col = this.verdict === 'miss' ? PAL.RED_L : PAL.GOLD_L;
      drawText(ui, label, GAME_W / 2, 84, {
        size: 11, color: col, align: 'center', bold: true, outline: true,
        alpha: Math.min(1, this.verdictT * 1.6),
      });
    }

    drawHint(ui, hint(ctx, 'chiffre-fear'), GAME_H - 44);
    drawText(ui, `${this.blow} / ${MAX_BLOWS}`, GAME_W - 20, GAME_H - 34, {
      size: 6, color: PAL.STEEL, align: 'right', outline: true,
    });
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: src(107) },
          { kind: 'narr', text: src(109) },
          { kind: 'line', who: 'ル・シッフル', text: '君の体には、いくらでも打つ場所がある。番号を言えば終わりだ。', portrait: 'chiffre' },
          { kind: 'narr', text: '殴られる瞬間に息を吐けば、衝撃は逃げる。[J] を当たる瞬間に合わせろ。' },
          { kind: 'narr', text: '[Q] で振りかぶりを凝視すれば当たる瞬間が見える。だが息が浅くなり、受け入れの幅は狭まる。\n[C] で息を止めれば、吐くのを一拍こらえられる。' },
          { kind: 'narr', text: '耐えるほど、焦るのは向こうだ。焦りきらせろ。' },
        ], () => this.advance(ctx));
        break;
      case 1:
        this.playing = true;
        this.resolve = 100;
        this.impatience = 0;
        this.blow = 0;
        this.breath.reset();
        ctx.audio.music('dread');
        this.startBlow(ctx);
        break;
    }
  }
}

registerStage('ch10', () => new Ch10());
