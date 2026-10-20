/**
 * 第2章 ホテル・スプレンディド（原作 L.59〜L.63）
 *
 *  受付で正体を明かし、バーでマティスと合流し、テラスの警察署長を見張る。
 *
 *  見張りは「護衛の視線を管理する」ゲーム。
 *  護衛は一定の周期でこちらを振り返る。振り返る直前、必ずグラスを卓に置く。
 *  見られている間に [Q] で観察を続けると疑われ度が上がり、満タンで気づかれる。
 *  [C] で息を止めると気配が薄れ、疑われ方が半分になる（肺は減る）。
 *  受け渡しは3段階あり、段を追うごとに護衛の周期が速くなる。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawBar } from '../gfx/ui';
import { drawBreath, drawHint, drawKeys } from '../gfx/minigame-hud';
import { ExploreChapter } from './explore';
import { registerStage } from './registry';
import { TopDownStage } from '../game/topdown';
import { say } from '../game/dialogue';
import { askAround } from '../game/gossip';
import { hint } from '../data/intel';
import { Breath } from '../game/breath';
import { assist, recordFail, clearFails } from '../game/assist';
import { buildHotelLobby, CH02 } from '../data/maps';
import { src } from '../data/story';
import { dist } from '../game/physics';

/** 観察の段階。1段ごとに必要な秒数と、護衛の周期。 */
const STAGES = [
  { label: '封筒が卓の下を滑る', need: 5.0, period: 5.0 },
  { label: '署長が中身を数えている', need: 5.6, period: 4.2 },
  { label: '上着の内側へ入れた', need: 5.0, period: 3.4 },
];

/** これ以上近づくと、観察していなくても怪しまれる */
const TOO_CLOSE = 34;
/** これ以上離れると何も読み取れない */
const TOO_FAR = 96;

const FAIL_ID = 'ch02-watch';

type Gaze = 'calm' | 'glass' | 'watching';

class Ch02 extends ExploreChapter {
  readonly name = 'ch02';
  readonly id: ChapterId = 'ch02';

  private watching = false;
  private rank = 0;
  private progress = 0;
  private suspicion = 0;
  private done = false;
  private breath = new Breath(0.34, 0.26, 1.4);

  /** 護衛の視線 */
  private gaze: Gaze = 'calm';
  private gazeT = 0;
  private caughtFlash = 0;
  private stageFlash = 0;

  constructor() {
    super();
    this.music = 'tension';
    const stage = new TopDownStage({
      map: buildHotelLobby(),
      spawnX: CH02.spawn.x,
      spawnY: CH02.spawn.y,
      tint: PAL.BLOOD,
      tintAlpha: 0.10,
      vignette: 0.64,
    });
    stage.player.setLook('bondSuit');
    stage.player.facing = 'up';

    this.setup(
      stage,
      [
        { id: 'clerk', name: '受付嬢', look: 'guestA', x: CH02.receptionist.x, y: CH02.receptionist.y, facing: 'down' },
        { id: 'mathis', name: 'ルネ・マティス', look: 'mathis', x: CH02.mathis.x, y: CH02.mathis.y, facing: 'down' },
        { id: 'vesper', name: 'ヴェスパー・リンド', look: 'vesper', x: CH02.vesper.x, y: CH02.vesper.y, facing: 'up' },
        { id: 'chief', name: '警察署長', look: 'guestB', x: CH02.chief.x, y: CH02.chief.y, facing: 'down', color: '#ef3348' },
        { id: 'briber', name: 'ル・シッフルの使い', look: 'thug', x: CH02.briber.x, y: CH02.briber.y, facing: 'up' },
        { id: 'guard', name: '署長の護衛', look: 'thug', x: CH02.guard.x, y: CH02.guard.y, facing: 'left', color: '#ef3348' },
      ],
      [
        {
          id: 'reception',
          x: CH02.reception.x, y: CH02.reception.y, radius: 26,
          label: 'チェックインする', guideLabel: 'フロント',
          item: 'bell', itemName: 'フロントの宿帳', itemOffsetY: -18,
          run: (c) => this.checkIn(c),
        },
        {
          id: 'mathis',
          x: CH02.bar.x, y: CH02.bar.y, radius: 26,
          label: 'バーのマティスと話す', guideLabel: 'バー（左翼）',
          item: 'martini', itemName: 'バーカウンター', itemOffsetY: -18,
          enabled: () => this.doneSpots.has('reception'),
          run: (c) => this.meetMathis(c),
        },
      ],
    );
  }

  private checkIn(ctx: SceneCtx): void {
    say(ctx, [
      { kind: 'narr', text: src(59) },
      { kind: 'line', who: 'ジェームズ・ボンド', text: 'ボンド。ジェームズ・ボンドだ。連れの部屋も同じ階に。', portrait: 'bond' },
      { kind: 'line', who: 'ヴェスパー・リンド', text: '……本名を名乗ったの？', portrait: 'vesper' },
      { kind: 'line', who: 'ジェームズ・ボンド', text: '向こうはもう知っている。隠すほうが不自然だ。', portrait: 'bond' },
    ], () => { this.objective = 'バーでマティスと合流する'; });
  }

  private meetMathis(ctx: SceneCtx): void {
    say(ctx, [
      { kind: 'narr', text: src(61) },
      { kind: 'line', who: 'ルネ・マティス', text: 'ル・シッフルは警察署長を買っている。今夜、テラスの奥で金を受け取るはずだ。', portrait: 'mathis' },
      { kind: 'line', who: 'ルネ・マティス', text: '署長には護衛がついている。近づきすぎるな。[Q]を押している間だけ、遠くからでも読める。', portrait: 'mathis' },
    ], (_r, c) => this.askMathis(c));
  }

  /** マティスは土地の人間。この先で効く話を持っている。 */
  private askMathis(ctx: SceneCtx): void {
    askAround(ctx, {
      who: 'ルネ・マティス',
      portrait: 'mathis',
      intro: [
        { kind: 'line', who: 'ルネ・マティス', text: '行く前に、何か聞いておくか？', portrait: 'mathis' },
      ],
      topics: [
        {
          id: 'guard-rhythm',
          ask: '「護衛はどんな男だ」',
          reply: [
            { kind: 'line', who: 'ルネ・マティス', text: '訓練は受けている。だが退屈しきっている。', portrait: 'mathis' },
            { kind: 'line', who: 'ルネ・マティス', text: '見ていろ。グラスを卓に置くたびに、周りを一周見回す。あれが合図だ。', portrait: 'mathis' },
          ],
        },
        {
          id: 'obanno',
          ask: '「他に気をつける相手は」',
          reply: [
            { kind: 'line', who: 'ルネ・マティス', text: 'スティーヴン・オバンノ。ル・シッフルに金を預けた側の男だ。', portrait: 'mathis' },
            { kind: 'line', who: 'ルネ・マティス', text: '力は化け物だが、三発続けて振ると肩で息をする。あれは持久力がない。', portrait: 'mathis' },
          ],
        },
        {
          id: 'stairs',
          ask: '「このホテルの造りは」',
          reply: [
            { kind: 'line', who: 'ルネ・マティス', text: '銀の階段が自慢でね。もっとも、手すりは建った時のままだ。', portrait: 'mathis' },
            { kind: 'line', who: 'ルネ・マティス', text: '人一人ぶんの重さがかかれば、折れる。……使う機会がないことを祈るよ。', portrait: 'mathis' },
          ],
        },
      ],
      exhausted: [
        { kind: 'line', who: 'ルネ・マティス', text: '行け。私はここで飲んでいる。', portrait: 'mathis' },
      ],
      onDone: () => this.beginWatch(),
    });
  }

  private beginWatch(): void {
    this.watching = true;
    this.rank = 0;
    this.progress = 0;
    this.suspicion = 0;
    this.breath.reset();
    this.gaze = 'calm';
    this.gazeT = 0;
    this.objective = 'テラスの受け渡しを [Q] で見張る';
    this.guideOverride = { x: CH02.terraceDoor.x, y: CH02.terraceDoor.y, label: 'テラスへ', radius: 22 };
  }

  // ── 見張りの本体 ─────────────────────────────────────────────

  private get period(): number {
    return STAGES[Math.min(this.rank, STAGES.length - 1)]!.period * (1 + assist(FAIL_ID));
  }

  protected override onPlayUpdate(ctx: SceneCtx, dt: number): void {
    if (!this.watching || this.done) return;
    if (this.caughtFlash > 0) this.caughtFlash -= dt;
    if (this.stageFlash > 0) this.stageFlash -= dt;

    const player = this.stage.player;
    const chief = this.npc('chief');
    const guard = this.npc('guard');
    if (!chief || !guard) return;

    // ── 護衛の視線サイクル ──
    // calm（テラスを向いている）→ glass（グラスを置く・0.7秒の予告）→ watching（こちらを見る）
    this.gazeT += dt;
    const per = this.period;
    if (this.gaze === 'calm' && this.gazeT > per * 0.55) {
      this.gaze = 'glass';
      this.gazeT = 0;
      ctx.audio.sfx('tick', 1.4);
    } else if (this.gaze === 'glass' && this.gazeT > 0.7) {
      this.gaze = 'watching';
      this.gazeT = 0;
      guard.facing = 'left';
    } else if (this.gaze === 'watching' && this.gazeT > per * 0.32) {
      this.gaze = 'calm';
      this.gazeT = 0;
      guard.facing = 'right';
    }

    // ── 距離 ──
    const d = dist(player.x, player.y, chief.x, chief.y);
    const inRange = d <= TOO_FAR && d >= TOO_CLOSE;

    // ── 息 ──
    const holding = this.breath.update(dt, ctx.input.isDown('steady'));

    // ── 観察 ──
    const observing = ctx.input.isDown('observe') && inRange;
    const seen = this.gaze === 'watching';

    if (observing) {
      this.progress += dt;
      if (Math.floor(this.progress * 4) !== Math.floor((this.progress - dt) * 4)) {
        ctx.audio.sfx('tick', 0.7);
      }
    } else {
      this.progress = Math.max(0, this.progress - dt * 0.7);
    }

    // ── 疑われ度 ──
    let gain = 0;
    if (seen && observing) gain += holding ? 17 : 34;
    if (d < TOO_CLOSE) gain += 22;
    if (gain > 0) {
      this.suspicion += gain * dt * (1 - assist(FAIL_ID));
    } else {
      this.suspicion = Math.max(0, this.suspicion - 20 * dt);
    }

    if (this.suspicion >= 100) { this.caught(ctx); return; }

    // ── 段階クリア ──
    const need = STAGES[this.rank]!.need;
    if (this.progress >= need) {
      this.rank++;
      this.progress = 0;
      this.stageFlash = 1;
      ctx.audio.sfx('ui.confirm');
      ctx.save.tellRead = Math.min(100, ctx.save.tellRead + 4);
      if (this.rank >= STAGES.length) { this.finishWatch(ctx); return; }
    }
  }

  private caught(ctx: SceneCtx): void {
    recordFail(FAIL_ID);
    this.suspicion = 0;
    this.progress = 0;
    this.caughtFlash = 1.6;
    this.breath.reset();
    this.gaze = 'calm';
    this.gazeT = 0;
    ctx.audio.sfx('ui.error');
    this.pausePlay();
    say(ctx, [
      { kind: 'narr', text: '護衛と目が合った。署長が顔を上げる。' },
      { kind: 'line', who: 'ルネ・マティス', text: '……離れろ。もう一度だ。', portrait: 'mathis' },
    ], (_r, c) => { this.play(c, this.objective); });
  }

  private finishWatch(ctx: SceneCtx): void {
    this.done = true;
    this.watching = false;
    clearFails(FAIL_ID);
    ctx.save.tellRead = Math.min(100, ctx.save.tellRead + 10);
    ctx.audio.sfx('ui.confirm');
    this.pausePlay();
    say(ctx, [
      { kind: 'narr', text: '厚い封筒が卓の下で滑る。署長はそれを受け取り、上着の内側へ入れた。' },
      { kind: 'narr', text: src(63) },
      { kind: 'line', who: 'ルネ・マティス', text: '副署長に電話をかけた。今夜のカジノに、邪魔者は来ない。', portrait: 'mathis' },
      { kind: 'line', who: 'ヴェスパー・リンド', text: 'タキシードを部屋に置いておいたわ。着てみて。', portrait: 'vesper' },
    ], (_r, c) => {
      c.save.flags['chiefExposed'] = true;
      this.guideOverride = null;
      writeSave(c.save);
      this.goChapter(c, 'ch03');
    });
  }

  // ── 描画 ─────────────────────────────────────────────────────

  protected override renderBackdrop(ctx: SceneCtx): void {
    super.renderBackdrop(ctx);
    if (!this.watching || this.done) return;

    const g = ctx.display.game;
    const ui = ctx.display.ui;
    const cx = this.stage.cam.drawX;
    const cy = this.stage.cam.drawY;
    const player = this.stage.player;
    const chief = this.npc('chief');
    const guard = this.npc('guard');
    if (!chief || !guard) return;

    const d = dist(player.x, player.y, chief.x, chief.y);
    const seen = this.gaze === 'watching';

    // ── 護衛の視界 ──
    const gx = guard.x - cx;
    const gy = guard.y - cy - 8;
    if (seen) {
      // ロビー側を向いている。扇形を描く。
      g.save();
      g.beginPath();
      g.moveTo(gx, gy);
      g.arc(gx, gy, 92, Math.PI * 0.72, Math.PI * 1.28);
      g.closePath();
      g.fillStyle = rgba(PAL.RED, 0.13);
      g.fill();
      g.strokeStyle = rgba(PAL.RED_L, 0.5);
      g.lineWidth = 1;
      g.stroke();
      g.restore();
    } else if (this.gaze === 'glass') {
      // 予告：グラスを置く
      const t = Math.floor(ctx.time * 12) % 2 === 0;
      g.fillStyle = t ? PAL.GOLD_L : PAL.GOLD;
      g.fillRect(Math.round(gx) + 5, Math.round(gy) - 2, 3, 4);
      drawText(ui, 'グラスを置いた', gx, gy - 20, {
        size: 6, color: PAL.GOLD_L, align: 'center', outline: true,
      });
    }

    // 護衛の頭上に視線の向き
    drawText(ui, seen ? '◀ 見ている' : '見ていない ▶', gx, gy - 12, {
      size: 6, color: seen ? PAL.RED_L : rgba(PAL.SILVER, 0.6), align: 'center', outline: true,
    });

    // ── 署長のマーカー ──
    const chx = Math.round(chief.x - cx);
    const chy = Math.round(chief.y - cy) - 26;
    if (Math.floor(ctx.time * 4) % 2 === 0) {
      g.fillStyle = rgba(PAL.GOLD_L, 0.85);
      g.fillRect(chx - 1, chy, 3, 3);
    }

    // ── HUD ──
    const st = STAGES[Math.min(this.rank, STAGES.length - 1)]!;
    drawText(ui, `${this.rank + 1}/${STAGES.length}  ${st.label}`, GAME_W / 2, 16, {
      size: 7, color: this.stageFlash > 0 ? PAL.GOLD_L : PAL.WHITE, align: 'center', outline: true,
    });
    drawBar(g, GAME_W / 2 - 46, 26, 92, 4, this.progress / st.need, PAL.GOLD, PAL.CHARCOAL);

    drawText(ui, '疑われ度', GAME_W - 62, GAME_H - 31, {
      size: 6, color: this.suspicion > 60 ? PAL.RED_L : rgba(PAL.SILVER, 0.8), outline: true,
    });
    drawBar(g, GAME_W - 62, GAME_H - 22, 54, 4,
      this.suspicion / 100, this.suspicion > 60 ? PAL.RED_L : PAL.RED, PAL.CHARCOAL);

    drawBreath(g, ui, this.breath, ctx.time);

    if (d < TOO_CLOSE) {
      drawText(ui, '近すぎる', GAME_W / 2, 36, { size: 8, color: PAL.RED_L, align: 'center', outline: true });
    } else if (d > TOO_FAR) {
      drawText(ui, '遠すぎて読めない', GAME_W / 2, 36, { size: 8, color: PAL.STEEL, align: 'center', outline: true });
    }

    drawHint(ui, hint(ctx, 'guard-rhythm'));
    drawKeys(ui, '[Q] 観察 / [C] 息を止める / WASD 距離を取る');

    if (this.caughtFlash > 0) {
      g.fillStyle = rgba(PAL.RED, 0.2 * Math.min(1, this.caughtFlash));
      g.fillRect(0, 0, GAME_W, GAME_H);
    }
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: 'モンテネグロ、ホテル・スプレンディド。中央がロビー、左翼にバー、右手はテラス。' },
          { kind: 'narr', text: '行き先が分からなくなったら [F]。目的地までの道が点線で出る。' },
        ], () => this.advance(ctx));
        break;
      case 1:
        this.play(ctx, 'フロントでチェックインする');
        break;
    }
  }
}

registerStage('ch02', () => new Ch02());
