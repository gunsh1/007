/**
 * M1 の動作確認用シーン。カジノの一室でボンドを操作し、
 * 移動・回避・攻撃・当たり判定・カメラ・ADVウィンドウ・音を一通り確かめる。
 * 本編には登場しない（デバッグメニューからのみ入れる）。
 */
import type { Scene, SceneCtx } from '../core/scene';
import { GAME_W, GAME_H } from '../core/display';
import { CASINO_TILES, TileMap, TILE } from '../gfx/tiles';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import { vignette, scanlines, drawBar, strokeRect } from '../gfx/ui';
import { Player } from '../game/player';
import { Actor } from '../game/entity';
import { Camera } from '../game/camera';
import { dist } from '../game/physics';
import { say } from '../game/dialogue';

const W = 46;
const H = 30;

function buildRoom(): string[] {
  const grid: string[][] = [];
  for (let y = 0; y < H; y++) {
    const row: string[] = [];
    for (let x = 0; x < W; x++) {
      if (y === 0) row.push('T');
      else if (y === 1) row.push('W');
      else if (x === 0 || x === W - 1 || y === H - 1) row.push('#');
      else row.push('.');
    }
    grid.push(row);
  }
  const put = (x: number, y: number, ch: string): void => {
    if (grid[y] && x >= 0 && x < W) grid[y]![x] = ch;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number, ch: string): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, ch);
  };

  // 中央の大理石の通路
  rect(20, 2, 25, H - 2, ',');
  // 柱を4本
  for (const [cx, cy] of [[8, 8], [8, 20], [37, 8], [37, 20]] as const) {
    put(cx, cy, 'I');
    put(cx, cy - 1, 'I');
  }
  // ポーカーテーブル（木縁 + フェルト）
  rect(12, 12, 19, 17, 'B');
  rect(13, 13, 18, 16, 'F');
  // 奥のカーテンと扉
  rect(2, 1, 6, 1, 'C');
  rect(39, 1, 43, 1, 'C');
  put(22, 1, 'D');
  put(23, 1, 'D');
  // 右手前の階段と手すり
  rect(30, 22, 36, 27, 'S');
  rect(30, 21, 36, 21, 'R');

  return grid.map((r) => r.join(''));
}

export class PlaygroundScene implements Scene {
  readonly name = 'playground';

  private map = new TileMap(CASINO_TILES, buildRoom());
  private cam = new Camera();
  private player = new Player({ x: 23 * TILE, y: 24 * TILE });
  private npcs: { actor: Actor; label: string; said: boolean }[] = [];
  private dummy: Actor;
  private hint = '';

  constructor() {
    this.cam.setBounds(this.map.pixelWidth, this.map.pixelHeight);
    this.cam.snapTo(this.player.x, this.player.y);

    const mathis = new Actor({ look: 'mathis', x: 28 * TILE, y: 10 * TILE, facing: 'down' });
    const vesper = new Actor({ look: 'vesper', x: 10 * TILE, y: 22 * TILE, facing: 'right' });
    this.npcs = [
      { actor: mathis, label: 'ルネ・マティス', said: false },
      { actor: vesper, label: 'ヴェスパー・リンド', said: false },
    ];

    // 殴って確かめるための的
    this.dummy = new Actor({ look: 'thug', x: 34 * TILE, y: 14 * TILE, hp: 120 });
  }

  onEnter(ctx: SceneCtx): void {
    ctx.audio.music('casino');
  }

  update(ctx: SceneCtx, dt: number): void {
    const solidActors = [...this.npcs.map((n) => n.actor), this.dummy]
      .filter((a) => !a.dead)
      .map((a) => a.foot);

    this.player.update(dt, ctx.input, ctx.audio, this.map, solidActors);

    // 攻撃判定を的に通す
    if (this.player.swingActive && !this.dummy.dead) {
      const ab = this.player.attackBox();
      const db = this.dummy.foot;
      const near = ab.x < db.x + db.w && ab.x + ab.w > db.x
        && ab.y < db.y + db.h + 12 && ab.y + ab.h > db.y - 12;
      if (near && !this.player.hitThisSwing.has(this.dummy)) {
        this.player.hitThisSwing.add(this.dummy);
        this.dummy.hurt(this.player.swingDamage, this.player.x, this.player.y, this.player.swingKnock);
        ctx.audio.sfx(this.player.heavySwing ? 'punch.heavy' : 'punch');
        this.cam.shake(this.player.heavySwing ? 3 : 1.6, 0.18);
      }
    }
    this.dummy.tick(dt, this.map);
    if (this.dummy.dead) {
      // 倒れたら数秒で復活（試し打ち用）
      this.dummy.iframes -= dt;
      if (this.dummy.iframes < -3) {
        this.dummy.dead = false;
        this.dummy.hp = this.dummy.maxHp;
        this.dummy.iframes = 0.4;
        this.dummy.playState('idle', true);
      }
    }

    for (const n of this.npcs) n.actor.tick(dt, this.map);

    // 会話
    this.hint = '';
    for (const n of this.npcs) {
      if (dist(this.player.x, this.player.y, n.actor.x, n.actor.y) < 22) {
        this.hint = `[E] ${n.label}と話す`;
        if (ctx.input.justPressed('interact')) {
          ctx.audio.sfx('ui.confirm');
          this.talk(ctx, n);
        }
        break;
      }
    }

    this.cam.follow(this.player.x, this.player.y - 8, dt);
  }

  private talk(ctx: SceneCtx, n: { actor: Actor; label: string; said: boolean }): void {
    if (n.label.startsWith('ルネ')) {
      say(ctx, [
        { kind: 'line', who: 'ルネ・マティス', text: 'よく来たな、ミスター・ボンド。モンテネグロは寒いだろう。', portrait: 'mathis' },
        { kind: 'line', who: 'ルネ・マティス', text: '警察署長はル・シッフルに買収されている。だが手は打ってある。', portrait: 'mathis' },
        {
          kind: 'choice',
          prompt: 'どう答える？',
          options: [
            { id: 'trust', label: '「信用していいのか、マティス」' },
            { id: 'thanks', label: '「助かった。恩に着る」' },
            { id: 'silent', label: '黙ってうなずく' },
          ],
        },
        { kind: 'line', who: 'ルネ・マティス', text: 'ふん。まあいい。今夜は楽しめ。', portrait: 'mathis' },
      ], (r) => {
        // 選択が状態に効いていることの確認
        if (r['last'] === 'thanks') ctx.save.vesper += 2;
      });
    } else {
      say(ctx, [
        { kind: 'narr', text: '深紅のドレスのヴェスパーが、こちらを一瞥した。' },
        { kind: 'line', who: 'ヴェスパー・リンド', text: 'あなたの服を見て、みんながあなたを値踏みしているわ。', portrait: 'vesper' },
        { kind: 'line', who: 'ジェームズ・ボンド', text: '君が選んだ服だ。文句は君に行く。', portrait: 'bond' },
      ]);
    }
    n.said = true;
  }

  render(ctx: SceneCtx, _alpha: number): void {
    const g = ctx.display.game;
    const ui = ctx.display.ui;
    const cx = this.cam.drawX;
    const cy = this.cam.drawY;

    g.fillStyle = PAL.VOID;
    g.fillRect(0, 0, GAME_W, GAME_H);

    this.map.draw(g, cx, cy, GAME_W, GAME_H, false);

    // Y ソートして描く
    const actors: Actor[] = [this.player, this.dummy, ...this.npcs.map((n) => n.actor)];
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw(g, cx, cy, ctx.debug.showHitboxes);

    this.map.draw(g, cx, cy, GAME_W, GAME_H, true);

    vignette(g, 0.5);
    scanlines(g, 0.06);

    // HUD
    drawBar(g, 8, 8, 60, 4, this.player.hp / this.player.maxHp, PAL.RED, PAL.CHARCOAL);
    drawText(ui, 'PLAYGROUND', 8, 15, { size: 7, color: PAL.STEEL });

    if (!this.dummy.dead) {
      const bx = this.dummy.x - cx;
      const by = this.dummy.y - cy - 24;
      drawBar(g, bx - 10, by, 20, 2, this.dummy.hp / this.dummy.maxHp, PAL.RED_L, PAL.INK);
    }

    if (this.hint) {
      drawText(ui, this.hint, GAME_W / 2, GAME_H - 26, {
        size: 8, color: PAL.GOLD_L, align: 'center', shadow: true,
      });
    }

    drawText(ui, 'WASD 移動 / J 弱 / K 強 / Shift 回避 / E 調べる / ~ デバッグ', GAME_W / 2, GAME_H - 12, {
      size: 7, color: rgba(PAL.SILVER, 0.75), align: 'center', shadow: true,
    });

    if (ctx.debug.showHitboxes) {
      strokeRect(g, this.player.attackBox().x - cx, this.player.attackBox().y - cy,
        this.player.attackBox().w, this.player.attackBox().h, rgba(PAL.GOLD_L, 0.5));
    }
  }
}
