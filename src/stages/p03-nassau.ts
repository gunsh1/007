/**
 * 前編 第3章 ナッソー／オーシャン・クラブ（原作 L.13〜L.19）
 *
 *  監視室に忍び込んで映像から送信者を割り出し、その男とポーカーで勝負して
 *  アストン・マーティンを巻き上げ、妻のソランジュから行き先を聞き出す。
 *
 *  潜入と卓が同じ章に同居する。カジノ編のホールデムをそのまま使う。
 */
import type { SceneCtx } from '../core/scene';
import type { ChapterId } from '../core/save';
import { writeSave } from '../core/save';
import { PAL } from '../gfx/palette';
import { registerStage } from './registry';
import { MissionChapter } from './mission';
import { GunStage, type GoonDef } from '../game/gunstage';
import { say } from '../game/dialogue';
import { TableScene, type TableSeatDef } from '../poker/table-scene';
import { TELL_PRESETS } from '../poker/tells';
import { TABLE_PROFILES } from '../poker/opponents';
import { buildOceanClub, P03 } from '../data/maps-prologue';
import { has } from '../data/loadout';
import { src } from '../data/story';
import { dist } from '../game/physics';

/** ディミトリオスとの卓。10人ではなく6人の小さな卓。 */
function nassauSeats(heroChips: number): TableSeatDef[] {
  const seats: TableSeatDef[] = [
    { name: 'ボンド', look: 'bond', profile: null, chips: heroChips },
    { name: 'アレックス・ディミトリオス', short: 'ディミトリオス', look: 'thug', profile: { ...TABLE_PROFILES[1]!, name: 'ディミトリオス', aggression: 0.74, bluffRate: 0.34 }, chips: 500_000 },
    { name: 'ホテルの客A', short: '客A', look: 'guestA', profile: TABLE_PROFILES[0]!, chips: 120_000 },
    { name: 'ホテルの客B', short: '客B', look: 'guestB', profile: TABLE_PROFILES[3]!, chips: 90_000 },
    { name: 'ホテルの客C', short: '客C', look: 'guestA', profile: TABLE_PROFILES[6]!, chips: 140_000 },
    { name: 'ホテルの客D', short: '客D', look: 'guestB', profile: TABLE_PROFILES[2]!, chips: 110_000 },
  ];
  return seats;
}

class P03Nassau extends MissionChapter {
  readonly name = 'p03';
  readonly id: ChapterId = 'p03';
  protected readonly failId = 'p03';

  private gotFootage = false;

  constructor() {
    super();
    this.stage = new GunStage({
      map: buildOceanClub(),
      spawnX: P03.spawn.x,
      spawnY: P03.spawn.y,
      tint: PAL.TEAL,
      tintAlpha: 0.10,
      vignette: 0.6,
    });
  }

  protected placeGoons(): GoonDef[] {
    return [
      // 監視室の当直
      { x: P03.security.x + 30, y: P03.security.y + 34, look: 'guestB', gun: 'fist', facing: -Math.PI / 2, sweep: 0.8, name: '当直' },
      // ロビーの警備
      { x: 200, y: 200, look: 'thug', gun: 'ppk', patrol: [{ x: 176, y: 160 }, { x: 176, y: 300 }, { x: 300, y: 300 }] },
      { x: 300, y: 120, look: 'thug', gun: 'ppk', patrol: [{ x: 300, y: 120 }, { x: 130, y: 120 }] },
      // 駐車場
      { x: P03.car.x - 40, y: P03.car.y, look: 'thug', gun: 'shotgun', facing: Math.PI, sweep: 0.6 },
    ];
  }

  protected override deathLine(): string { return 'ホテルの警備に取り押さえられた。'; }

  protected override onRaidUpdate(ctx: SceneCtx, _dt: number): void {
    if (this.gotFootage) return;
    if (dist(this.stage.x, this.stage.y, P03.security.x, P03.security.y) > 26) return;

    // 電子ロックピックを持っていれば、端末をそのまま開けられる
    const quick = has(this.kit, 'picks');
    this.gotFootage = true;
    this.playing = false;
    const r = this.rate();
    ctx.audio.music('none');
    say(ctx, [
      { kind: 'narr', text: src(13) },
      {
        kind: 'narr',
        text: quick
          ? 'ロックピックが端末を開ける。該当の時刻に映っていたのは一人。'
          : '管理者のパスワードは付箋に書かれていた。該当の時刻に映っていたのは一人。',
      },
      { kind: 'narr', text: src(15) },
      { kind: 'line', who: 'ジェームズ・ボンド', text: 'アレックス・ディミトリオス。武器商人。……今夜、下の卓にいる。', portrait: 'bond' },
      {
        kind: 'line', who: 'M',
        text: r.spotted === 0 ? '静かにやったのね。珍しい。' : 'また騒ぎを起こしたわね。',
        portrait: 'mendel',
      },
    ], (_r2, c) => this.advance(c));
  }

  private makeTable(ctx: SceneCtx): TableScene {
    return new TableScene({
      title: 'オーシャン・クラブ — ディミトリオスの卓',
      seats: nassauSeats(ctx.save.chips > 0 ? Math.min(ctx.save.chips, 200_000) : 120_000),
      smallBlind: 2_000,
      bigBlind: 4_000,
      tells: TELL_PRESETS.ch08,
      music: 'casino',
      maxHands: 6,
      blindUp: { everyHands: 2, factor: 1.6 },
      skip: { hero: 400_000, chiffre: 0, outcome: 'handsDone' },
      onFinish: (c, _outcome, scene) => {
        c.scenes.pop();
        // 勝っても負けても、原作どおり車は手に入る（負ければ「借り」になる）
        const won = scene.heroChips > 200_000;
        c.save.flags['astonWon'] = won;
        this.jumpTo(c, won ? 4 : 4);
      },
    });
  }

  protected run(ctx: SceneCtx): void {
    switch (this.step) {
      case 0:
        say(ctx, [
          { kind: 'narr', text: 'バハマ、ナッソー。リゾートホテル「オーシャン・クラブ」。' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: 'メッセージはこのホテルから出た。あとは、その時刻の映像を見るだけだ。', portrait: 'bond' },
        ], () => this.advance(ctx));
        break;

      case 1:
        this.chooseKit(ctx, 'ナッソー — オーシャン・クラブ', '監視室は施錠されている。ロックピックがあれば早い。');
        break;

      case 2:
        this.hintText = '警備の巡回は決まった道を回っている';
        this.waypoint = { x: P03.security.x, y: P03.security.y, label: '監視室' };
        this.beginRaid(ctx, '監視室のモニタを見る');
        break;

      case 3:
        say(ctx, [
          { kind: 'narr', text: 'その夜。ボンドはディミトリオスの向かいに座った。' },
          { kind: 'line', who: 'アレックス・ディミトリオス', text: '……見ない顔だな。何を賭ける？', portrait: 'thug' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '君の車を。表に停まっている、1964年型のアストン・マーティンを。', portrait: 'bond' },
        ], () => this.advance(ctx));
        break;

      case 4:
        if (ctx.save.flags['astonDone']) { this.jumpTo(ctx, 5); break; }
        ctx.save.flags['astonDone'] = true;
        ctx.scenes.push(this.makeTable(ctx));
        break;

      case 5:
        say(ctx, [
          { kind: 'narr', text: src(17) },
          {
            kind: 'line', who: 'ジェームズ・ボンド',
            text: ctx.save.flags['astonWon'] ? '鍵をもらおう。' : '……この一局は預けておく。鍵は先にもらうが。',
            portrait: 'bond',
          },
          { kind: 'line', who: 'ソランジュ', text: '夫の車を巻き上げて、次はわたし？', portrait: 'vesper' },
          { kind: 'line', who: 'ジェームズ・ボンド', text: '部屋で一杯どうかな。', portrait: 'bond' },
          { kind: 'narr', text: src(19) },
          { kind: 'line', who: 'ソランジュ', text: '……マイアミ。あの人、いつも急に発つの。', portrait: 'vesper' },
        ], (_r, c) => {
          c.save.chips = 0;
          writeSave(c.save);
          this.goChapter(c, 'p04');
        });
        break;
    }
  }
}

registerStage('p03', () => new P03Nassau());

