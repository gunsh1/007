/**
 * 第9章 夜道（原作 L.101〜L.105）
 *
 *  誘拐されたヴェスパーを乗せた車を、アストンマーティンで追う。
 *
 *  障害物を避けるゲームではなく、距離の駆け引きにしてある。
 *   ・近すぎる … 後部座席から撃たれる。フロントガラスが割れていく
 *   ・遠すぎる … テールランプを見失い、分岐で手がかりが読めなくなる
 *   ・その間の「適正距離」を保っている時だけ、相手の車の挙動が読める
 *  一定距離ごとに分岐路が来る。タイヤ痕・舞う埃・飛び立つ鳥から正しい側を選ぶ。
 *  間違えると大きく引き離される。
 *
 *  最後、路上に転がされたヴェスパーを避けようとしてハンドルを切り、横転する。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { drawBar, fade, vignette, scanlines, flash } from '../gfx/ui';
import { drawHint, drawKeys } from '../gfx/minigame-hud';
import { ChapterScene } from './chapter';
import { registerStage } from './registry';
import { say } from '../game/dialogue';
import { DeathScene } from '../scenes/death';
import { drawCar, drawHeadlights, ASTON, ENEMY_CAR, CAR_W, CAR_H } from '../gfx/props';
import { anims } from '../gfx/actors';
import { Rng, fxRng } from '../core/rng';
import { clamp } from '../game/physics';
import { Particles } from '../game/fx';
import { hint } from '../data/intel';
import { assist, recordFail, clearFails } from '../game/assist';
import { src } from '../data/story';

const ROAD_X = 92;
const ROAD_W = 200;
const PLAYER_Y = GAME_H - 52;

/** 追いつくまでの距離 */
const CHASE_LENGTH = 2400;
/** 分岐は何メートルおきに来るか */
const FORK_EVERY = 620;

/** 距離帯（px 相当）。小さいほど近い。 */
const GAP_MIN = 30;
const GAP_MAX = 300;
/** 撃たれる距離 */
const GAP_DANGER = 96;
/** 見失う距離 */
const GAP_LOST = 226;

const FAIL_ID = 'ch09-chase';

interface Bullet { x: number; y: number; vy: number }

/** 分岐の手がかり。正解の側にだけ「通った跡」が出る。 */
interface Fork {
  /** 正解 */
  answer: 'left' | 'right';
  /** 手がかりの種類 */
  clue: 'dust' | 'tracks' | 'birds';
  /** 残り猶予 */
  t: number;
  /** 手がかりが読めるか（適正距離にいたか） */
  readable: boolean;
}

const CLUE_TEXT: Record<Fork['clue'], [string, string]> = {
  dust: ['埃がまだ白く舞っている', '土が乾いて静まっている'],
  tracks: ['新しいタイヤ痕が残っている', '路面に跡がない'],
  birds: ['林から鳥が飛び立ったばかりだ', '林は静かなままだ'],
};

type Phase = 'drive' | 'fork' | 'vesper' | 'crash' | 'done';

class Ch09 extends ChapterScene {
  readonly name = 'ch09';
  readonly id: ChapterId = 'ch09';

  private rng = new Rng(0x0d09_1a11);
  private particles = new Particles();

  private phase: Phase = 'drive';
  private carX = ROAD_X + ROAD_W / 2;
  private carVX = 0;
  private speed = 150;
  private travelled = 0;
  private hp = 100;
  private scroll = 0;
  /** 敵車との距離 */
  private gap = 150;
  private hitFlash = 0;
  private shake = 0;
  private crashT = 0;
  private vesperY = -60;
  private playing = false;

  private bullets: Bullet[] = [];
  private shootAcc = 0;
  /** [R] ヘッドライト。消せば狙われにくいが、路面が読めなくなる。 */
  private lightsOn = true;
  private fork: Fork | null = null;
  private nextForkAt = FORK_EVERY;
  private forkFlash = 0;
  private forkMsg = '';
  /** 適正距離を保てているか（分岐の手がかりが読める条件） */
  private get tailing(): boolean { return this.gap > GAP_DANGER && this.gap < GAP_LOST; }

  override update(ctx: SceneCtx, dt: number): void {
    super.update(ctx, dt);
    if (!this.playing) return;

    if (this.hitFlash > 0) this.hitFlash -= dt * 2;
    if (this.shake > 0) this.shake -= dt;
    if (this.forkFlash > 0) this.forkFlash -= dt;
    this.particles.update(dt);

    if (this.phase === 'crash') {
      this.crashT += dt;
      if (this.crashT > 2.2) {
        this.playing = false;
        this.phase = 'done';
        this.jumpTo(ctx, 2);
      }
      return;
    }

    // ── ヘッドライト ──
    if (ctx.input.justPressed('gadget')) {
      this.lightsOn = !this.lightsOn;
      ctx.audio.sfx('ui.move', this.lightsOn ? 1.2 : 0.7);
    }

    // ── 運転 ──
    const steer = ctx.input.axisX();
    this.carVX += steer * 520 * dt;
    this.carVX *= 1 - 6 * dt;
    this.carX += this.carVX * dt;
    this.carX = clamp(this.carX, ROAD_X + 8, ROAD_X + ROAD_W - 8 - CAR_W);

    // アクセルとブレーキで「距離」を作る
    const accel = ctx.input.isDown('up');
    const brake = ctx.input.isDown('down');
    const wanted = accel ? 268 : brake ? 96 : 178;
    this.speed += (wanted - this.speed) * 2.2 * dt;
    this.scroll += this.speed * dt;
    this.travelled += this.speed * dt;

    // 相手も速度を変える。詰めれば縮まり、緩めれば開く。
    const theirSpeed = 178 + Math.sin(this.travelled / 340) * 26;
    this.gap = clamp(this.gap - (this.speed - theirSpeed) * dt * 0.75, GAP_MIN, GAP_MAX);

    // ── 撃たれる ──
    if (this.gap < GAP_DANGER && this.phase !== 'vesper') {
      // 消灯していれば狙いが甘くなる
      const dark = this.lightsOn ? 1 : 0.3;
      const rate = (1 - (this.gap - GAP_MIN) / (GAP_DANGER - GAP_MIN)) * (1 - assist(FAIL_ID)) * dark;
      this.shootAcc += dt * rate * 3.4;
      if (this.shootAcc > 1) {
        this.shootAcc = 0;
        const ex = ROAD_X + ROAD_W / 2 + Math.sin(this.travelled / 220) * 40;
        this.bullets.push({ x: ex + CAR_W / 2 + this.rng.float(-6, 6), y: PLAYER_Y - this.gap, vy: 260 });
        ctx.audio.sfx('gunshot', 0.9);
      }
    } else {
      this.shootAcc = 0;
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]!;
      b.y += b.vy * dt;
      if (b.y > GAME_H + 10) { this.bullets.splice(i, 1); continue; }
      const hit = b.x > this.carX && b.x < this.carX + CAR_W && b.y > PLAYER_Y && b.y < PLAYER_Y + CAR_H;
      if (!hit) continue;
      this.bullets.splice(i, 1);
      if (!ctx.debug.invincible) this.hp -= 9;
      this.hitFlash = 1;
      this.shake = 0.22;
      this.particles.dust(b.x, b.y, 6, PAL.SILVER);
      ctx.audio.sfx('glass', 1.1);
      if (this.hp <= 0) {
        this.playing = false;
        recordFail(FAIL_ID);
        ctx.scenes.push(new DeathScene('フロントガラスが砕けた。ヴェスパーを見失った。', (c) => this.retry(c)));
        return;
      }
    }

    // ── 分岐 ──
    if (this.phase === 'drive' && this.travelled >= this.nextForkAt && this.travelled < CHASE_LENGTH - 200) {
      this.phase = 'fork';
      this.fork = {
        answer: this.rng.chance(0.5) ? 'left' : 'right',
        clue: this.rng.pick(['dust', 'tracks', 'birds'] as const),
        t: 3.4 * (1 + assist(FAIL_ID)),
        // 路面を読むには、適正距離とヘッドライトの両方が要る
        readable: this.tailing && this.lightsOn,
      };
      ctx.audio.sfx('tick', 1.6);
    }

    if (this.phase === 'fork' && this.fork) {
      this.fork.t -= dt;
      const pick = ctx.input.justPressed('left') ? 'left' : ctx.input.justPressed('right') ? 'right' : null;
      if (pick) {
        const right = pick === this.fork.answer;
        this.forkFlash = 1.2;
        if (right) {
          this.forkMsg = '追いついた';
          this.gap = clamp(this.gap - 46, GAP_MIN, GAP_MAX);
          ctx.audio.sfx('ui.confirm');
        } else {
          this.forkMsg = '道を間違えた';
          this.gap = clamp(this.gap + 92, GAP_MIN, GAP_MAX);
          ctx.audio.sfx('ui.error');
          this.shake = 0.3;
        }
        this.fork = null;
        this.phase = 'drive';
        this.nextForkAt = this.travelled + FORK_EVERY;
      } else if (this.fork.t <= 0) {
        this.forkFlash = 1.2;
        this.forkMsg = '迷った';
        this.gap = clamp(this.gap + 70, GAP_MIN, GAP_MAX);
        this.fork = null;
        this.phase = 'drive';
        this.nextForkAt = this.travelled + FORK_EVERY;
        ctx.audio.sfx('ui.error');
      }
    }

    // ── 見失う ──
    if (this.gap >= GAP_MAX - 1 && this.phase !== 'vesper') {
      this.playing = false;
      recordFail(FAIL_ID);
      ctx.scenes.push(new DeathScene('テールランプが夜に消えた。ヴェスパーを見失った。', (c) => this.retry(c)));
      return;
    }

    // ── ヴェスパー発見 ──
    if ((this.phase === 'drive' || this.phase === 'fork') && this.travelled >= CHASE_LENGTH) {
      this.phase = 'vesper';
      this.fork = null;
      this.bullets = [];
      this.vesperY = -40;
      clearFails(FAIL_ID);
      ctx.audio.sfx('sting');
      say(ctx, [
        { kind: 'narr', text: src(103) },
        { kind: 'line', who: 'ジェームズ・ボンド', text: '……ヴェスパー！', portrait: 'bond' },
        { kind: 'narr', text: '路上に、手足を縛られた彼女が転がされている。ハンドルを切れ。' },
      ]);
      return;
    }

    if (this.phase === 'vesper') {
      this.vesperY += this.speed * dt;
      if (this.vesperY > PLAYER_Y + 10) {
        this.phase = 'crash';
        this.crashT = 0;
        this.shake = 1.2;
        ctx.audio.sfx('glass');
        ctx.audio.sfx('bodyfall');
        this.particles.dust(this.carX + CAR_W / 2, PLAYER_Y, 40, PAL.SILVER);
        ctx.audio.music('none');
      }
    }
  }

  private retry(ctx: SceneCtx): void {
    this.hp = 100;
    this.travelled = Math.max(0, this.travelled - 700);
    this.nextForkAt = this.travelled + 260;
    this.bullets = [];
    this.speed = 150;
    this.gap = 150;
    this.carX = ROAD_X + ROAD_W / 2;
    this.phase = 'drive';
    this.playing = true;
    ctx.audio.music('combat');
  }

  protected override renderBackdrop(ctx: SceneCtx): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;

    const sx = this.shake > 0 ? Math.round(fxRng.float(-0.5, 0.5) * this.shake * 8) : 0;
    const sy = this.shake > 0 ? Math.round(fxRng.float(-0.5, 0.5) * this.shake * 8) : 0;
    g.save();
    g.translate(sx, sy);

    // 夜の路肩
    g.fillStyle = '#0a0d12';
    g.fillRect(-8, -8, GAME_W + 16, GAME_H + 16);
    g.fillStyle = '#14180f';
    g.fillRect(-8, -8, ROAD_X + 8, GAME_H + 16);
    g.fillRect(ROAD_X + ROAD_W, -8, GAME_W, GAME_H + 16);

    // 路面
    g.fillStyle = PAL.ASPHALT;
    g.fillRect(ROAD_X, -8, ROAD_W, GAME_H + 16);
    g.fillStyle = PAL.ASPHALT_L;
    g.fillRect(ROAD_X, -8, 3, GAME_H + 16);
    g.fillRect(ROAD_X + ROAD_W - 3, -8, 3, GAME_H + 16);

    const dash = 24;
    const off = Math.floor(this.scroll) % (dash * 2);
    for (const lx of [ROAD_X + ROAD_W / 3, ROAD_X + (ROAD_W * 2) / 3]) {
      g.fillStyle = rgba(PAL.SILVER, 0.45);
      for (let y = -dash * 2 + off; y < GAME_H + dash; y += dash * 2) {
        g.fillRect(Math.round(lx), Math.round(y), 2, dash);
      }
    }
    g.fillStyle = PAL.AMBER;
    for (let y = -40 + (Math.floor(this.scroll) % 40); y < GAME_H + 40; y += 40) {
      g.fillRect(ROAD_X - 4, Math.round(y), 2, 3);
      g.fillRect(ROAD_X + ROAD_W + 2, Math.round(y), 2, 3);
    }

    // 前を走る誘拐犯の車
    if (this.phase !== 'vesper' && this.phase !== 'crash') {
      const ty = PLAYER_Y - this.gap;
      const ex = ROAD_X + ROAD_W / 2 - CAR_W / 2 + Math.sin(this.travelled / 220) * 40;
      if (ty > -CAR_H) {
        drawCar(g, ex, ty, ENEMY_CAR, true, 0);
        // 銃口
        if (this.gap < GAP_DANGER) {
          const f = Math.floor(ctx.time * 14) % 2 === 0;
          g.fillStyle = f ? PAL.GOLD_L : PAL.AMBER;
          g.fillRect(Math.round(ex + CAR_W / 2) - 1, Math.round(ty) + CAR_H - 2, 3, 3);
        }
      } else {
        // 見えていない：ぼんやりしたテールランプだけ
        g.fillStyle = rgba(PAL.RED, 0.5);
        g.fillRect(ROAD_X + ROAD_W / 2 - 8, 2, 3, 2);
        g.fillRect(ROAD_X + ROAD_W / 2 + 5, 2, 3, 2);
      }
    }

    // 弾
    for (const b of this.bullets) {
      g.fillStyle = PAL.GOLD_L;
      g.fillRect(Math.round(b.x), Math.round(b.y), 1, 4);
    }

    // 路上のヴェスパー
    if (this.phase === 'vesper' || this.phase === 'crash') {
      const vx = ROAD_X + ROAD_W / 2 - 6;
      anims('vesper').downed.frames[0]!.draw(g, vx + 6, Math.round(this.vesperY) + 16);
    }

    // 自車
    if (this.phase !== 'crash') {
      if (this.lightsOn) drawHeadlights(g, this.carX + CAR_W / 2, PLAYER_Y, 90, 0.14);
      drawCar(g, this.carX, PLAYER_Y, ASTON, true, 1 - this.hp / 100);
    } else {
      const t = Math.min(1, this.crashT / 0.7);
      g.save();
      g.translate(this.carX + CAR_W / 2, PLAYER_Y + CAR_H / 2 + t * 30);
      g.rotate(t * 2.2);
      g.translate(-CAR_W / 2, -CAR_H / 2);
      drawCar(g, 0, 0, ASTON, true, 0.9);
      g.restore();
    }

    this.particles.draw(g, 0, 0);
    g.restore();

    // 消灯中は夜そのものが濃くなる
    if (!this.lightsOn && this.phase !== 'crash') fade(g, 0.42);
    vignette(g, 0.72);
    if (this.hitFlash > 0) flash(g, this.hitFlash * 0.4);
    if (this.phase === 'crash') fade(g, Math.min(0.9, this.crashT / 2));
    scanlines(g, 0.06);

    if (!this.playing) return;

    // ── HUD ──
    drawBar(g, 8, 10, 70, 5, this.hp / 100, PAL.RED, PAL.CHARCOAL);
    drawText(ui, 'ASTON MARTIN DB5', 8, 2, { size: 6, color: PAL.SILVER, outline: true });
    drawText(ui, `${Math.round(this.speed * 0.9)} km/h`, GAME_W - 8, 2, {
      size: 7, color: PAL.GOLD_L, align: 'right', outline: true,
    });

    // 距離のメーター。危険・適正・見失いの三帯。
    this.drawGapMeter(g, ui);

    const prog = Math.min(1, this.travelled / CHASE_LENGTH);
    drawBar(g, GAME_W - 78, 22, 70, 3, prog, PAL.GOLD, PAL.CHARCOAL);

    if (this.phase === 'fork' && this.fork) this.drawFork(g, ui, this.fork);
    else if (this.forkFlash > 0) {
      drawText(ui, this.forkMsg, GAME_W / 2, 52, {
        size: 10, color: this.forkMsg === '追いついた' ? PAL.GOLD_L : PAL.RED_L,
        align: 'center', bold: true, outline: true, alpha: Math.min(1, this.forkFlash),
      });
    }

    if (this.phase === 'vesper') {
      drawText(ui, 'ハンドルを切れ！', GAME_W / 2, 40, {
        size: 12, color: PAL.RED_L, align: 'center', bold: true, outline: true,
      });
    } else {
      drawText(ui, this.lightsOn ? '[R] ライト ON' : '[R] ライト OFF — 狙われにくいが路面が読めない', 8, 30, {
        size: 6, color: this.lightsOn ? rgba(PAL.SILVER, 0.75) : PAL.AMBER, outline: true,
      });
      drawHint(ui, hint(ctx, 'road'), GAME_H - 22);
      drawKeys(ui, 'A/D 操舵  W 詰める  S 離す  R ライト — 近いと撃たれ、遠いと見失う');
    }
  }

  private drawGapMeter(g: CanvasRenderingContext2D, ui: CanvasRenderingContext2D): void {
    const x = 100;
    const y = 12;
    const w = 184;
    const h = 5;
    const at = (v: number): number => x + ((v - GAP_MIN) / (GAP_MAX - GAP_MIN)) * w;

    g.fillStyle = PAL.CHARCOAL;
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    // 危険帯
    g.fillStyle = rgba(PAL.RED, 0.55);
    g.fillRect(x, y, at(GAP_DANGER) - x, h);
    // 適正帯
    g.fillStyle = rgba(PAL.FELT_L, 0.55);
    g.fillRect(at(GAP_DANGER), y, at(GAP_LOST) - at(GAP_DANGER), h);
    // 見失い帯
    g.fillStyle = rgba(PAL.SLATE, 0.7);
    g.fillRect(at(GAP_LOST), y, x + w - at(GAP_LOST), h);
    // 現在地
    const px = Math.round(clamp(at(this.gap), x, x + w));
    g.fillStyle = this.tailing ? PAL.GOLD_L : PAL.RED_L;
    g.fillRect(px - 1, y - 3, 3, h + 6);

    drawText(ui, '撃たれる', x, y + 8, { size: 6, color: rgba(PAL.RED_L, 0.8), outline: true });
    drawText(ui, '見失う', x + w, y + 8, { size: 6, color: rgba(PAL.SILVER, 0.7), align: 'right', outline: true });
    drawText(ui, this.tailing ? '追尾中' : this.gap <= GAP_DANGER ? '近すぎる' : '離れすぎ', x + w / 2, y - 11, {
      size: 7, color: this.tailing ? PAL.GOLD_L : PAL.RED_L, align: 'center', bold: true, outline: true,
    });
  }

  private drawFork(g: CanvasRenderingContext2D, ui: CanvasRenderingContext2D, f: Fork): void {
    const [yes, no] = CLUE_TEXT[f.clue];
    const leftText = f.answer === 'left' ? yes : no;
    const rightText = f.answer === 'right' ? yes : no;

    g.fillStyle = rgba(PAL.VOID, 0.82);
    g.fillRect(0, 46, GAME_W, 52);
    g.fillStyle = PAL.GOLD;
    g.fillRect(0, 46, GAME_W, 1);
    g.fillRect(0, 97, GAME_W, 1);

    drawText(ui, '分かれ道', GAME_W / 2, 50, {
      size: 7, color: PAL.GOLD_L, align: 'center', bold: true,
    });

    if (f.readable) {
      drawText(ui, `← ${leftText}`, 10, 62, { size: 7, color: PAL.WHITE });
      drawText(ui, `${rightText} →`, GAME_W - 10, 62, { size: 7, color: PAL.WHITE, align: 'right' });
    } else {
      drawText(ui, '離れすぎて、路面が見えない', GAME_W / 2, 62, {
        size: 7, color: PAL.RED_L, align: 'center',
      });
    }
    drawText(ui, '[A] 左   /   [D] 右', GAME_W / 2, 76, {
      size: 8, color: PAL.GOLD_L, align: 'center', bold: true,
    });
    drawBar(g, GAME_W / 2 - 40, 90, 80, 3, Math.max(0, f.t) / 3.4, PAL.RED, PAL.CHARCOAL);
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: src(101) },
          { kind: 'line', who: 'ジェームズ・ボンド', text: 'マティスが呼び出した……違う。罠だ。', portrait: 'bond' },
          { kind: 'narr', text: 'アストンマーティンのエンジンが唸る。テールランプを追え。' },
          { kind: 'narr', text: '近づきすぎれば後部座席から撃たれる。離れすぎれば夜に見失う。\nその間を保て。分かれ道では、路面が答えを教えてくれる。' },
        ], () => this.advance(ctx));
        break;

      case 1:
        this.playing = true;
        this.phase = 'drive';
        this.gap = 150;
        this.nextForkAt = FORK_EVERY;
        ctx.audio.music('combat');
        break;

      case 2:
        say(ctx, [
          { kind: 'narr', text: src(105) },
          { kind: 'line', who: 'ル・シッフル', text: '君の友達のマティスは、私の友達だ。', portrait: 'chiffre' },
        ], (_r, c) => {
          c.save.flags['crashed'] = true;
          writeSave(c.save);
          this.goChapter(c, 'ch10');
        });
        break;
    }
  }
}

registerStage('ch09', () => new Ch09());
