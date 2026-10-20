/**
 * 前編 第2章 Mの自宅（原作 L.11）
 *
 *  上司の家に押し入って、上司のPCで軍情報部を叩く。
 *  ここで撃つ相手はいない。いるのは寝ているMと、通りの警邏だけ。
 *
 *  攻め方：
 *   ・玄関から静かに（警邏の視線を避ける）
 *   ・バルコニーから（遠回りだが誰にも見られない）
 *   ・Mを起こしてしまってもいい。原作でも彼女は起きる。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { PAL } from '../gfx/palette';
import { registerStage } from './registry';
import { MissionChapter } from './mission';
import { GunStage, type GoonDef } from '../game/gunstage';
import { say } from '../game/dialogue';
import { buildFlat, P02 } from '../data/maps-prologue';
import { src } from '../data/story';
import { dist } from '../game/physics';

class P02Flat extends MissionChapter {
  readonly name = 'p02';
  readonly id: ChapterId = 'p02';
  protected readonly failId = 'p02';

  private atPc = false;

  constructor() {
    super();
    this.stage = new GunStage({
      map: buildFlat(),
      spawnX: P02.spawn.x,
      spawnY: P02.spawn.y,
      tint: PAL.NAVY,
      tintAlpha: 0.24,
      vignette: 0.78,
      hp: 3,
    });
  }

  protected placeGoons(): GoonDef[] {
    return [
      // 通りを見る警邏（窓越しに見える）
      { x: 96, y: 40, look: 'guestB', gun: 'fist', patrol: [{ x: 60, y: 40 }, { x: 300, y: 40 }] },
      // 寝ているM。近づけば起きる。
      { x: P02.bedroom.x, y: P02.bedroom.y, look: 'mendel', gun: 'fist', name: 'M', facing: Math.PI / 2, sweep: 0.25 },
    ];
  }

  protected override deathLine(): string { return '取り押さえられた。'; }

  protected override onRaidUpdate(ctx: SceneCtx, _dt: number): void {
    if (this.atPc) return;
    if (dist(this.stage.x, this.stage.y, P02.pc.x, P02.pc.y) > 24) return;
    this.atPc = true;
    this.playing = false;
    const r = this.rate();
    ctx.audio.music('none');
    say(ctx, [
      { kind: 'narr', text: 'Mの端末。ログイン名は本人の名前。暗証番号は――何度も肩越しに見ていた。' },
      { kind: 'narr', text: src(11) },
      { kind: 'line', who: 'ジェームズ・ボンド', text: 'バハマ、ナッソー。……悪くない出張先だ。', portrait: 'bond' },
      {
        kind: 'line', who: 'M',
        text: r.spotted === 0
          ? '……いつからそこにいたの。'
          : 'あなた、自分が今どこにいるか分かってる？　私の家よ。',
        portrait: 'mendel',
      },
      { kind: 'line', who: 'M', text: '00 になったばかりで、もう上司の家に押し入るのね。', portrait: 'mendel' },
    ], (_r2, c) => {
      c.save.flags['nassau'] = true;
      writeSave(c.save);
      this.goChapter(c, 'p03');
    });
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: 'ロンドン。Mの自宅。灯りは消えている。' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '「エリプシス」を追うには、軍情報部のデータベースがいる。……Mの名前で。', portrait: 'bond' },
          { kind: 'narr', text: 'ここで撃つ相手はいない。見つからずに書斎の端末まで行け。' },
        ], () => this.advance(ctx));
        break;

      case 1:
        this.chooseKit(ctx, 'ロンドン — Mの自宅', '銃は要らないかもしれない。持っていく物を選べ。', {
          hide: ['spare', 'smoke'],
        });
        break;

      case 2:
        this.hintText = '玄関からでも、バルコニーからでも入れる';
        this.waypoint = { x: P02.pc.x, y: P02.pc.y, label: 'Mの端末' };
        this.beginRaid(ctx, '書斎の端末に辿り着く');
        ctx.audio.music('tension');
        break;
    }
  }
}

registerStage('p02', () => new P02Flat());
