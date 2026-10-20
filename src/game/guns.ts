/**
 * 銃。Hotline Miami 式。
 *
 *  ・敵は一発で死ぬ。ボンドは三発で死ぬ
 *  ・弾は有限。切れたら死体から拾うか、銃そのものを投げつける
 *  ・銃声は部屋を越えて響き、聞いた敵が寄ってくる。サプレッサーはそれを殺す
 *  ・撃つと反動で銃口が跳ねる。走りながら撃てば当たらない
 */
import { PAL } from '../gfx/palette';

export type GunId =
  | 'fist'        // 素手
  | 'knife'       // ナイフ（近接・無音）
  | 'ppk'         // ワルサーPPK
  | 'ppkS'        // サプレッサー付きPPK
  | 'smg'         // 短機関銃（敵の得物）
  | 'shotgun'     // ショットガン（大使館の警備）
  | 'rifle';      // ライフル（空港の警備）

export interface GunSpec {
  id: GunId;
  name: string;
  /** 近接か */
  melee: boolean;
  /** 装弾数。melee は 0 */
  mag: number;
  /** 連射間隔（秒） */
  cooldown: number;
  /** 一度に出る弾数（ショットガン） */
  pellets: number;
  /** 拡散（ラジアン） */
  spread: number;
  /** 弾速 px/s */
  speed: number;
  /** 銃声が届く距離。0 なら無音。 */
  noise: number;
  /** 撃った時の反動（照準のブレ・ラジアン） */
  kick: number;
  /** 押しっぱなしで撃ち続けるか */
  auto: boolean;
  /** 描画色 */
  color: string;
  /** 近接の届く距離 */
  reach: number;
}

export const GUNS: Record<GunId, GunSpec> = {
  fist: {
    id: 'fist', name: '素手', melee: true, mag: 0, cooldown: 0.34, pellets: 0,
    spread: 0, speed: 0, noise: 40, kick: 0, auto: false, color: PAL.SILVER, reach: 15,
  },
  knife: {
    id: 'knife', name: 'ナイフ', melee: true, mag: 0, cooldown: 0.30, pellets: 0,
    spread: 0, speed: 0, noise: 0, kick: 0, auto: false, color: PAL.SILVER, reach: 17,
  },
  ppk: {
    id: 'ppk', name: 'ワルサーPPK', melee: false, mag: 7, cooldown: 0.22, pellets: 1,
    spread: 0.03, speed: 420, noise: 260, kick: 0.07, auto: false, color: PAL.GOLD_L, reach: 0,
  },
  ppkS: {
    id: 'ppkS', name: 'PPK（消音）', melee: false, mag: 7, cooldown: 0.28, pellets: 1,
    spread: 0.045, speed: 380, noise: 44, kick: 0.06, auto: false, color: PAL.SILVER, reach: 0,
  },
  smg: {
    id: 'smg', name: '短機関銃', melee: false, mag: 24, cooldown: 0.075, pellets: 1,
    spread: 0.10, speed: 400, noise: 300, kick: 0.05, auto: true, color: PAL.AMBER, reach: 0,
  },
  shotgun: {
    id: 'shotgun', name: 'ショットガン', melee: false, mag: 5, cooldown: 0.62, pellets: 6,
    spread: 0.26, speed: 340, noise: 340, kick: 0.16, auto: false, color: PAL.RED_L, reach: 0,
  },
  rifle: {
    id: 'rifle', name: 'ライフル', melee: false, mag: 12, cooldown: 0.34, pellets: 1,
    spread: 0.015, speed: 560, noise: 330, kick: 0.09, auto: false, color: PAL.WHITE, reach: 0,
  },
};

/** 手に持っている銃の状態 */
export interface Held {
  id: GunId;
  ammo: number;
}

export function makeHeld(id: GunId): Held {
  return { id, ammo: GUNS[id].mag };
}

/** 飛んでいる弾 */
export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 撃った側 */
  fromHero: boolean;
  /** 残り寿命（秒） */
  life: number;
  color: string;
  /** 直前の位置（線分判定用） */
  px: number;
  py: number;
}

/** 床に落ちている銃 */
export interface GroundGun {
  x: number;
  y: number;
  id: GunId;
  ammo: number;
  /** 投げられて滑っている間の速度 */
  vx: number;
  vy: number;
  /** 回転 */
  spin: number;
  /** 落ちてからの秒数 */
  t: number;
}

/** 銃声・足音などの「音」。聞いた敵が寄ってくる。 */
export interface Noise {
  x: number;
  y: number;
  radius: number;
  /** 表示用の残り時間 */
  t: number;
}

export function gunLabel(h: Held | null): string {
  if (!h) return '素手';
  const g = GUNS[h.id];
  return g.melee ? g.name : `${g.name}  ${h.ammo}/${g.mag}`;
}
