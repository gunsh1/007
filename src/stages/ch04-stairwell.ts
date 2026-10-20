/**
 * 第4章 銀の階段（原作 L.73〜L.81）
 *
 *  休憩中。ル・シッフルの部屋へ向かう途中、階段でオバンノとその部下に見つかる。
 *  弾は使えない。素手とマチェットの死闘。本作最大の山場。
 *
 *  殴り合いではなく「息が続くか」のゲームにしてある。
 *   ・攻撃も回避もスタミナを食う。空にすると1秒以上棒立ちになる
 *   ・[C] で呼吸を整えると一気に戻るが、その間は動けず打たれ弱い
 *   ・強攻撃を相手の予備動作に当てるとマチェットを叩き落とせる。
 *     床に落ちた得物は、先に踏んだほうのものになる
 *   ・よろけた相手・息を切らした相手を [E] で掴んで投げる。
 *     階段の口へ投げれば手すりが折れて転落する
 *   ・敵も三発続けて振ると息が上がる。そこが最大の反撃機会
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { ChapterScene } from './chapter';
import { registerStage } from './registry';
import { say } from '../game/dialogue';
import { TopDownStage } from '../game/topdown';
import { Enemy } from '../game/enemy';
import { Actor } from '../game/entity';
import { buildStairwell, CH04 } from '../data/maps';
import { DeathScene } from '../scenes/death';
import { drawGuide, clearGuideCache } from '../game/guide';
import { drawHint, drawKeys } from '../gfx/minigame-hud';
import { hint } from '../data/intel';
import { assist, recordFail, clearFails } from '../game/assist';

type Mode = 'story' | 'climb' | 'fight' | 'cleared';

const FAIL_ID = 'ch04-fight';

class Ch04 extends ChapterScene {
  readonly name = 'ch04';
  readonly id: ChapterId = 'ch04';

  private stage: TopDownStage;
  private vesper: Actor;
  private mode: Mode = 'story';
  private clearT = 0;
  private banner = '';

  constructor() {
    super();
    this.stage = new TopDownStage({
      map: buildStairwell(),
      spawnX: CH04.spawn.x,
      spawnY: CH04.spawn.y,
      tint: PAL.NAVY,
      tintAlpha: 0.22,
      vignette: 0.72,
      throwZones: CH04.throwZones,
    });
    this.stage.player.flags.stamina = true;
    this.vesper = new Actor({ look: 'vesper', x: CH04.vesperSpawn.x, y: CH04.vesperSpawn.y, facing: 'up' });
    this.vesper.label = 'ヴェスパー・リンド';
    this.stage.npcs.push(this.vesper);
  }

  protected override renderBackdrop(ctx: SceneCtx): void {
    this.stage.render(ctx);
    if (this.mode !== 'story') this.stage.drawHud(ctx);

    const ui = ctx.display.ui;
    const g = ctx.display.game;

    // 道案内。上がるべき階段の先を指す。
    if (this.mode === 'climb') {
      drawGuide(g, ui, this.stage.map, this.stage.cam.drawX, this.stage.cam.drawY,
        { x: this.stage.player.x, y: this.stage.player.y },
        { x: CH04.landingCenter.x, y: CH04.landingCenter.y, label: '踊り場（ル・シッフルの階へ）', radius: 26 },
        ctx.time, ctx.input.isDown('guide'));
    }

    if (this.banner) {
      drawText(ui, this.banner, GAME_W / 2, GAME_H - 22, {
        size: 8, color: PAL.GOLD_L, align: 'center', outline: true,
      });
    }
    if (this.mode === 'climb') {
      drawText(ui, 'WASD 移動 / F 目的地', GAME_W / 2, GAME_H - 10, {
        size: 6, color: rgba(PAL.SILVER, 0.7), align: 'center', outline: true,
      });
    } else if (this.mode === 'fight') {
      // 階段の口（投げると落ちる場所）を薄く光らせる
      const cx = this.stage.cam.drawX;
      const cy = this.stage.cam.drawY;
      for (const z of CH04.throwZones) {
        const zx = z.x - cx;
        const zy = z.y - cy;
        if (zx < -60 || zx > GAME_W + 60) continue;
        const pulse = 0.5 + 0.5 * Math.sin(ctx.time * 2.2);
        g.strokeStyle = rgba(PAL.GOLD, 0.12 + pulse * 0.14);
        g.lineWidth = 1;
        g.setLineDash([4, 4]);
        g.beginPath();
        g.ellipse(zx, zy, z.r, z.r * 0.4, 0, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }

      drawHint(ui, hint(ctx, 'obanno') ?? hint(ctx, 'stairs'), GAME_H - 20);
      drawKeys(ui, 'J 弱 / K 強（予備動作に当てて得物を落とす）/ Shift 回避 / E 掴んで投げる / C 呼吸');
    }
  }

  override update(ctx: SceneCtx, dt: number): void {
    super.update(ctx, dt);
    if (this.mode === 'story') return;

    this.stage.update(ctx, dt);

    if (this.mode === 'climb') {
      this.banner = '階段を上がれ';
      if (this.stage.player.y < CH04.triggerY) {
        this.banner = '';
        this.mode = 'fight';
        this.startAmbush(ctx);
      }
      return;
    }

    if (this.mode === 'fight') {
      if (this.stage.player.dead && !ctx.debug.invincible) {
        this.mode = 'story';
        recordFail(FAIL_ID);
        ctx.scenes.push(new DeathScene('オバンノに殺された。', (c) => this.retryFight(c)));
        return;
      }
      if (this.stage.liveEnemies.length === 0) {
        this.mode = 'cleared';
        this.clearT = 0;
        clearFails(FAIL_ID);
        ctx.audio.music('calm');
      }
      return;
    }

    if (this.mode === 'cleared') {
      this.clearT += dt;
      if (this.clearT > 1.4) {
        this.mode = 'story';
        this.jumpTo(ctx, 3);
      }
    }
  }

  private spawnEnemies(): void {
    const obanno = new Enemy('obanno', { look: 'obanno', x: CH04.obannoSpawn.x, y: CH04.obannoSpawn.y, facing: 'down' });
    obanno.label = 'スティーヴン・オバンノ';
    obanno.labelColor = PAL.RED_L;
    obanno.armed = true;
    const thug = new Enemy('thug', { look: 'thug', x: CH04.thugSpawn.x, y: CH04.thugSpawn.y, facing: 'down' });
    thug.label = 'オバンノの部下';
    thug.labelColor = PAL.RED;
    thug.armed = true;
    this.stage.enemies = [obanno, thug];
    this.stage.weapons = [];
    this.stage.player.armed = false;
    this.stage.player.st = 100;
    this.stage.player.exhaustT = 0;
    for (const e of this.stage.enemies) e.aiState = 'chase';
  }

  private startAmbush(ctx: SceneCtx): void {
    this.spawnEnemies();
    this.stage.cam.shake(4, 0.4);
    ctx.audio.sfx('sting');
    ctx.audio.music('combat');
    this.mode = 'story';
    say(ctx, [
      { kind: 'narr', text: 'ボンドの耳につけたイヤホンから、盗聴の音が漏れた。踊り場の奥から、二つの影が立ち上がる。マチェットが二本。' },
      { kind: 'line', who: 'スティーヴン・オバンノ', text: '金はどこだ。ル・シッフルに預けた、俺の金は。', portrait: 'obanno' },
      { kind: 'narr', text: '銃は使えない。カジノに音を届かせるわけにはいかない。' },
      { kind: 'narr', text: '殴るのも避けるのも息を食う。切らせば棒立ちだ。\n[C] で呼吸を整えろ。ただし、その間は動けない。' },
      { kind: 'narr', text: '[K] の強攻撃を相手の予備動作（赤い印）に合わせれば、マチェットを叩き落とせる。\n落ちた得物は、先に踏んだほうのものだ。' },
      { kind: 'narr', text: 'よろけた相手・息を切らした相手は [E] で掴んで投げられる。\n階段の口へ投げれば、手すりごと落ちる。' },
      { kind: 'fx', run: () => { this.mode = 'fight'; } },
    ]);
  }

  private retryFight(ctx: SceneCtx): void {
    const p = this.stage.player;
    p.dead = false;
    // 3回沈むごとに、少しだけ余分に体力を持って始める（表示はしない）
    p.maxHp = 100 + Math.round(100 * assist(FAIL_ID));
    p.hp = p.maxHp;
    p.iframes = 1.0;
    p.knockX = 0;
    p.knockY = 0;
    p.stun = 0;
    p.x = CH04.landingCenter.x;
    p.y = CH04.landingCenter.y + 40;
    p.playState('idle', true);
    this.stage.particles.clear();
    this.stage.floats.clear();
    this.stage.cam.snapTo(p.x, p.y);
    this.spawnEnemies();
    ctx.audio.music('combat');
    this.mode = 'fight';
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: '休憩に入った直後、ル・シッフルの部屋から叫び声が聞こえた。' },
          { kind: 'line', who: 'ヴェスパー・リンド', text: '……今の、何？', portrait: 'vesper' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '盗聴器を仕掛けておいた。誰かがル・シッフルを訪ねている。', portrait: 'bond' },
          { kind: 'narr', text: '階段を上がって、ル・シッフルの階へ向かえ。' },
        ], () => this.advance(ctx));
        break;

      case 1:
        this.mode = 'climb';
        clearGuideCache();
        ctx.audio.music('tension');
        break;

      case 2:
        // 襲撃中。update 側で進行する。
        break;

      case 3:
        say(ctx, [
          { kind: 'narr', text: '激闘の末、ボンドはオバンノたちを倒した。' },
          { kind: 'line', who: 'ルネ・マティス', text: '死体は私が始末する。君は卓に戻れ。何事もなかったようにな。', portrait: 'mathis' },
          { kind: 'narr', text: '部屋に戻ったボンドは、ドレスを着たままシャワーを浴びて座り込むヴェスパーを見つけた。' },
          { kind: 'line', who: 'ヴェスパー・リンド', text: '……血が、落ちないの。', portrait: 'vesper' },
          {
            kind: 'choice',
            prompt: 'どうする？',
            options: [
              { id: 'sit', label: '服のまま隣に座り、寄り添う' },
              { id: 'towel', label: 'タオルを渡して外に出る' },
              { id: 'leave', label: '何も言わず立ち去る' },
            ],
          },
        ], (r, c) => {
          this.lastChoice = r['last'] ?? 'sit';
          this.applyVesperChoice(c);
          this.goChapter(c, 'ch05');
        });
        break;
    }
  }

  private lastChoice = 'sit';

  private applyVesperChoice(ctx: SceneCtx): void {
    if (this.lastChoice === 'sit') ctx.save.vesper = Math.min(100, ctx.save.vesper + 25);
    else if (this.lastChoice === 'towel') ctx.save.vesper = Math.min(100, ctx.save.vesper + 8);
    else ctx.save.vesper = Math.max(0, ctx.save.vesper - 5);
    writeSave(ctx.save);
  }

  override render(ctx: SceneCtx, alpha: number): void {
    super.render(ctx, alpha);
    if (this.mode === 'cleared') {
      const g = ctx.display.game;
      g.fillStyle = rgba(PAL.VOID, Math.min(0.85, this.clearT / 1.4));
      g.fillRect(0, 0, GAME_W, GAME_H);
    }
  }
}

registerStage('ch04', () => new Ch04());
