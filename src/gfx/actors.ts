/** キャラクターのスプライト束。方向 3種（下・上・横）で、右は横を反転して使う。 */
import { PAL } from './palette';
import { Sprite, anim, type AnimDef, type SpriteDef } from './sprites';
import * as B from './sprite-defs/bond';

export type Dir4 = 'down' | 'up' | 'left' | 'right';
export type Dir3 = 'down' | 'up' | 'side';

export function dir3(d: Dir4): Dir3 { return d === 'left' || d === 'right' ? 'side' : d; }
export function flipFor(d: Dir4): boolean { return d === 'right'; }

/** ベクトルから4方向を決める。上下より左右を優先すると見下ろしでは自然。 */
export function dirFromVec(dx: number, dy: number, fallback: Dir4): Dir4 {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

export interface CharAnims {
  idle: Record<Dir3, AnimDef>;
  walk: Record<Dir3, AnimDef>;
  attack: Record<Dir3, AnimDef>;
  hurt: AnimDef;
  downed: AnimDef;
  /** 構え（銃）。無い場合は idle を使う。 */
  aim?: Record<Dir3, AnimDef>;
  /** ポーカー用：着席・こめかみに手を当てる仕草 */
  seated: Sprite;
  seatedTemple: Sprite;
  temple: Sprite;
}

/** ボンドの体格を流用してパレットだけ差し替えたキャラを作る（群衆・雑魚用） */
export function buildHumanoid(overrides?: Record<number, string>): CharAnims {
  const s = (d: SpriteDef): Sprite => new Sprite(d, overrides);
  const sideAim = s(B.BOND_SIDE_AIM);
  return {
    idle: {
      down: anim([s(B.BOND_DOWN_IDLE)], 1),
      up: anim([s(B.BOND_UP_IDLE)], 1),
      side: anim([s(B.BOND_SIDE_IDLE)], 1),
    },
    walk: {
      down: anim([s(B.BOND_DOWN_IDLE), s(B.BOND_DOWN_WALK1), s(B.BOND_DOWN_IDLE), s(B.BOND_DOWN_WALK2)], 9),
      up: anim([s(B.BOND_UP_IDLE), s(B.BOND_UP_WALK1), s(B.BOND_UP_IDLE), s(B.BOND_UP_WALK2)], 9),
      side: anim([s(B.BOND_SIDE_IDLE), s(B.BOND_SIDE_WALK1), s(B.BOND_SIDE_IDLE), s(B.BOND_SIDE_WALK2)], 9),
    },
    attack: {
      down: anim([s(B.BOND_DOWN_PUNCH)], 12, false),
      up: anim([s(B.BOND_UP_PUNCH)], 12, false),
      side: anim([s(B.BOND_SIDE_PUNCH)], 12, false),
    },
    aim: {
      down: anim([s(B.BOND_DOWN_IDLE)], 1),
      up: anim([s(B.BOND_UP_IDLE)], 1),
      side: anim([sideAim], 1),
    },
    hurt: anim([s(B.BOND_HURT)], 1, false),
    downed: anim([s(B.BOND_DOWNED)], 1, false),
    seated: s(B.HUMAN_DOWN_SEATED),
    seatedTemple: s(B.HUMAN_DOWN_SEATED_TEMPLE),
    temple: s(B.HUMAN_DOWN_TEMPLE),
  };
}

// 主要キャラのパレット差分。索引は sprite-defs/bond.ts の P に対応。
//   1=上着 2=シャツ 3=肌 4=髪 5=肌影 6=ネクタイ 7=金属
export const LOOK = {
  /** ボンド：タキシード（既定） */
  bond: undefined as Record<number, string> | undefined,
  /** ボンド：スーツ（第00〜02章） */
  bondSuit: { 1: PAL.SLATE, 2: PAL.SILVER, 6: PAL.NAVY },
  /** ル・シッフル：黒スーツ、青白い肌、血の涙の左目 */
  chiffre: { 1: '#101319', 2: PAL.SILVER, 3: '#cfc0b4', 5: '#9b8b80', 4: '#241d1a', 6: PAL.BLOOD },
  /** ヴェスパー：深紅のドレス */
  vesper: { 1: PAL.BLOOD, 2: PAL.RED_L, 4: '#2b1f1a', 6: PAL.GOLD },
  /** マティス：くたびれたベージュのスーツ */
  mathis: { 1: '#6b6152', 2: PAL.WHITE, 4: '#4a4038', 6: PAL.BROWN },
  /** フィリックス・ライター */
  felix: { 1: '#2a2f3a', 2: PAL.WHITE, 3: '#8a5c3c', 5: '#5f3d27', 4: '#171310', 6: PAL.STEEL },
  /** オバンノ：黒い革コート */
  obanno: { 1: '#2b211b', 2: '#4d3f34', 3: '#9c6a45', 5: '#6d4529', 4: '#1c1512', 6: '#2b211b' },
  /** オバンノの部下 */
  thug: { 1: '#333a47', 2: '#4a5364', 3: '#c99a72', 5: '#96694a', 4: '#241d18', 6: '#333a47' },
  /** メンデル（スイス銀行） */
  mendel: { 1: '#20262f', 2: PAL.WHITE, 4: '#8d8d8d', 6: PAL.STEEL },
  /** ミスター・ホワイト */
  white: { 1: '#22252b', 2: '#b9bfc9', 4: '#8b8b8b', 3: '#d2b295', 6: '#22252b' },
  /** その他のポーカー参加者（背景の富豪たち） */
  guestA: { 1: '#241a2c', 2: PAL.SILVER, 4: '#3b2c22', 6: PAL.PURPLE },
  guestB: { 1: '#1a2a24', 2: '#d8d2c4', 4: '#5a4a3a', 6: PAL.TEAL },
} satisfies Record<string, Record<number, string> | undefined>;

export type LookName = keyof typeof LOOK;

const cache = new Map<LookName, CharAnims>();

/** キャラ見た目のアニメ束を取得（初回のみラスタライズ） */
export function anims(look: LookName): CharAnims {
  const hit = cache.get(look);
  if (hit) return hit;
  const made = buildHumanoid(LOOK[look]);
  cache.set(look, made);
  return made;
}

/** 状態と向きからアニメを選ぶ */
export function selectAnim(a: CharAnims, state: 'idle' | 'walk' | 'attack' | 'aim' | 'hurt' | 'downed', d: Dir4): AnimDef {
  const k = dir3(d);
  switch (state) {
    case 'walk': return a.walk[k];
    case 'attack': return a.attack[k];
    case 'aim': return (a.aim ?? a.idle)[k];
    case 'hurt': return a.hurt;
    case 'downed': return a.downed;
    default: return a.idle[k];
  }
}
