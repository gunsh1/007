/**
 * 第7章 ヴェスパー・マティーニ（原作 L.93〜L.97）
 *
 *  ジギタリス系の毒を盛られたボンドが、駐車場の車まで歩き、除細動器をつけようとする。
 *  だが線が抜けている。
 *
 *  歩きは「急ぐほど後で苦しくなる」ジレンマ。
 *   ・[Shift] で走ると速いが心拍が上がる。歩けば落ち着くが毒の時間が減る
 *   ・車に着いた時の心拍が、そのまま除細動器での「手の震え」になる
 *  本体は配線パズル（scenes/wiring.ts）。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawBar, fade } from '../gfx/ui';
import { drawKeys } from '../gfx/minigame-hud';
import { ExploreChapter } from './explore';
import { registerStage } from './registry';
import { TopDownStage } from '../game/topdown';
import { say } from '../game/dialogue';
import { WiringScene } from '../scenes/wiring';
import { DeathScene } from '../scenes/death';
import { buildEscape, CH07 } from '../data/maps';
import { drawCar, ASTON } from '../gfx/props';
import { drawNameTag } from '../game/guide';
import { hint } from '../data/intel';
import { recordFail, assist } from '../game/assist';
import { src } from '../data/story';
import { dist, clamp } from '../game/physics';

const CAR = CH07.car;
const START = CH07.spawn;
/** 毒が回りきるまでの秒数。走れば距離は稼げるが、心拍が上がる。 */
const TIME_LIMIT = 58;

const WALK_SPEED = 44;
const RUN_SPEED = 92;

class Ch07 extends ExploreChapter {
  readonly name = 'ch07';
  readonly id: ChapterId = 'ch07';

  private poisonT = 0;
  private collapsed = false;
  private heartAcc = 0;
  private atCar = false;
  /** 0..1。走ると上がり、歩くと下がる。到着時の値が配線の震えになる。 */
  private pulse = 0.25;

  constructor() {
    super();
    this.music = 'dread';
    const stage = new TopDownStage({
      map: buildEscape(),
      spawnX: START.x,
      spawnY: START.y,
      tint: PAL.PURPLE,
      tintAlpha: 0.18,
      vignette: 0.7,
    });
    stage.player.facing = 'down';
    this.setup(stage, [], []);
    this.guideOverride = { x: CAR.x, y: CAR.y, label: 'アストンマーティン', radius: 24 };
  }

  private get severity(): number {
    return Math.min(1, this.poisonT / (TIME_LIMIT * (1 + assist('ch07-walk'))));
  }

  protected override onPlayUpdate(ctx: SceneCtx, dt: number): void {
    if (this.collapsed) return;
    this.poisonT += dt;
    const s = this.severity;
    const p = this.stage.player;
    p.flags.poison = 0.12 + s * 0.7;

    // 走るか歩くか。ここでの選択が、そのまま除細動器の難易度になる。
    const moving = Math.hypot(ctx.input.axisX(), ctx.input.axisY()) > 0.05;
    const running = ctx.input.isDown('dodge') && moving;
    p.speed = running ? RUN_SPEED : WALK_SPEED;
    this.pulse = clamp(this.pulse + (running ? 0.14 : moving ? 0.01 : -0.10) * dt, 0.15, 1);
    // 毒は心拍に乗って回る
    this.poisonT += this.pulse * 0.5 * dt;

    // 心音
    this.heartAcc += dt * (1 + this.pulse * 1.8);
    if (this.heartAcc > 1.1) {
      this.heartAcc = 0;
      ctx.audio.sfx('heartbeat', 1 + this.pulse * 0.3);
      this.stage.cam.shake(this.pulse * 2.4, 0.2);
    }

    if (!this.atCar && dist(p.x, p.y, CAR.x, CAR.y) < 26) {
      this.atCar = true;
      this.pausePlay();
      this.reachCar(ctx);
      return;
    }

    if (this.poisonT >= TIME_LIMIT * (1 + assist('ch07-walk'))) {
      this.collapsed = true;
      recordFail('ch07-walk');
      this.pausePlay();
      ctx.scenes.push(new DeathScene('毒が回りきった。車まで辿り着けなかった。', (c) => this.retryWalk(c)));
    }
  }

  private retryWalk(ctx: SceneCtx): void {
    this.poisonT = TIME_LIMIT * 0.3;
    this.collapsed = false;
    this.atCar = false;
    this.pulse = 0.25;
    const p = this.stage.player;
    p.x = START.x;
    p.y = START.y + 40;
    p.hp = p.maxHp;
    p.dead = false;
    p.flags.poison = 0.3;
    this.stage.cam.snapTo(p.x, p.y);
    this.play(ctx, '駐車場のアストンマーティンまで — 走るか、歩くか');
  }

  private reachCar(ctx: SceneCtx): void {
    say(ctx, [
      { kind: 'narr', text: src(95) },
      { kind: 'line', who: 'MI6 技術班', text: '心電図を送ってください。……ジギタリス系の毒物です。すぐに解毒剤を。', portrait: 'mendel' },
      { kind: 'narr', text: '首に針を刺す。指の感覚が少しだけ戻った。' },
      { kind: 'line', who: 'MI6 技術班', text: '除細動器を起動してください。', portrait: 'mendel' },
      { kind: 'narr', text: '……作動しない。線が、抜けている。' },
      {
        kind: 'narr',
        text: this.pulse > 0.6
          ? '走ってきたぶん、心臓が暴れている。手が言うことを聞かない。'
          : '息は上がっていない。指はまだ、動く。',
      },
    ], (_r, c) => this.wiring(c));
  }

  private wiring(ctx: SceneCtx): void {
    ctx.scenes.push(new WiringScene({
      pulse: this.pulse,
      hintText: hint(ctx, 'defib'),
      onDone: (ok, c) => this.shockSelf(c, ok),
    }));
  }

  private shockSelf(ctx: SceneCtx, self: boolean): void {
    ctx.audio.sfx('shock');
    this.stage.cam.shake(6, 0.5);
    say(ctx, self ? [
      { kind: 'narr', text: '端子が噛み合った。指がボタンを押す。' },
      { kind: 'narr', text: '胸を蹴られたような衝撃。視界が白く飛んで――戻ってきた。' },
      { kind: 'line', who: 'ヴェスパー・リンド', text: 'ジェームズ！　……生きてる。生きてるのね。', portrait: 'vesper' },
    ] : [
      { kind: 'narr', text: '震える指が、最後の線を取り落とした。' },
      { kind: 'narr', text: '意識を失い、心肺停止に陥るボンド。' },
      { kind: 'narr', text: '彼を救ってくれたのは、ヴェスパーだった。彼女が線を押し込み、ボタンを叩く。' },
      { kind: 'line', who: 'ヴェスパー・リンド', text: '……何やってるのよ、あなた。', portrait: 'vesper' },
    ], (_r, c) => {
      c.save.flags['selfRevived'] = self;
      c.save.vesper = Math.min(100, c.save.vesper + (self ? 6 : 14));
      writeSave(c.save);
      say(c, [{ kind: 'narr', text: src(97) }], (_r2, c2) => this.goChapter(c2, 'ch08'));
    });
  }

  protected override renderBackdrop(ctx: SceneCtx): void {
    super.renderBackdrop(ctx);
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    const cx = this.stage.cam.drawX;
    const cy = this.stage.cam.drawY;

    // アストンマーティン
    drawCar(g, CAR.x - cx - 10, CAR.y - cy - 26, ASTON, true, 0);
    const near = dist(this.stage.player.x, this.stage.player.y, CAR.x, CAR.y) < 60;
    drawNameTag(ui, 'アストンマーティン', CAR.x - cx, CAR.y - cy - 38,
      near ? PAL.GOLD_L : rgba(PAL.GOLD, 0.7), near);

    const s = this.severity;
    // 視界が閉じていく。心拍が高いほど脈打つ。
    const beat = Math.max(0, Math.sin(this.heartAcc * 6)) * this.pulse * 14;
    const grad = g.createRadialGradient(
      GAME_W / 2, GAME_H / 2, 20 + (1 - s) * 90 - beat,
      GAME_W / 2, GAME_H / 2, 60 + (1 - s) * 120,
    );
    grad.addColorStop(0, rgba(PAL.VOID, 0));
    grad.addColorStop(1, rgba(PAL.VOID, 0.55 + s * 0.42));
    g.fillStyle = grad;
    g.fillRect(0, 0, GAME_W, GAME_H);

    const pulseRed = Math.max(0, Math.sin(this.heartAcc * 6));
    if (s > 0.2) fade(g, pulseRed * s * this.pulse * 0.22, PAL.BLOOD);

    if (!this.playing) return;

    // 毒の残り
    drawBar(g, GAME_W / 2 - 50, 14, 100, 4, 1 - s, s > 0.7 ? PAL.RED_L : PAL.RED, PAL.CHARCOAL);
    drawText(ui, '毒', GAME_W / 2, 6, { size: 7, color: PAL.RED_L, align: 'center', outline: true });

    // 心拍。これが除細動器での震えになる。
    drawText(ui, '心拍（このまま車に着くと手が震える）', 8, 26, {
      size: 6, color: this.pulse > 0.6 ? PAL.RED_L : rgba(PAL.SILVER, 0.85), outline: true,
    });
    drawBar(g, 8, 35, 90, 4, this.pulse, this.pulse > 0.6 ? PAL.RED_L : PAL.AMBER, PAL.CHARCOAL);

    drawKeys(ui, 'WASD 歩く（心拍が下がる）/ Shift 走る（心拍が上がる）');
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: src(93) },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '……ヴェスパー・マティーニを。ステアじゃなくシェイクで。', portrait: 'bond' },
          { kind: 'narr', text: 'グラスを空にした数分後、指先の感覚が消えた。' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '……車だ。車まで、行かないと。', portrait: 'bond' },
          { kind: 'narr', text: '走れば早い。だが心臓が速く打つほど、毒は速く回り、手は震える。\n車に着いた時の心拍が、そのまま指先の精度になる。' },
        ], () => this.advance(ctx));
        break;
      case 1:
        this.poisonT = 0;
        this.pulse = 0.25;
        this.play(ctx, '駐車場のアストンマーティンまで — 走るか、歩くか');
        break;
    }
  }
}

registerStage('ch07', () => new Ch07());
