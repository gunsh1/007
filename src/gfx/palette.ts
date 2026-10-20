/** 007 的な限定パレット。黒・深紅・金・タキシードの白。 */
export const PAL = {
  VOID:     '#05060a',
  INK:      '#0b0e15',
  CHARCOAL: '#161b26',
  SLATE:    '#28313f',
  STEEL:    '#46566e',
  SILVER:   '#8b9bb4',
  WHITE:    '#e9eef6',

  SKIN:     '#e2ab84',
  SKIN_D:   '#a9714e',
  HAIR:     '#3a2f2a',
  HAIR_L:   '#5c4a3d',

  BLOOD:    '#6e1019',
  RED:      '#c1182a',
  RED_L:    '#ef3348',

  GOLD:     '#c9a227',
  GOLD_L:   '#f2d16b',

  FELT:     '#1f5d3a',
  FELT_L:   '#2c7a4b',
  FELT_D:   '#123a24',

  BROWN:    '#4a3526',
  BROWN_L:  '#6d5138',

  NAVY:     '#1a2740',
  TEAL:     '#2f6b73',
  PURPLE:   '#4b2b52',
  AMBER:    '#e08a2c',
  GREEN_OK: '#4fbf6a',
  ASPHALT:  '#1b1f26',
  ASPHALT_L:'#252a33',
} as const;

export type ColorName = keyof typeof PAL;

/** スプライト定義でよく使う並び。索引 0 は必ず透明。 */
export const SKIN_RAMP = [PAL.SKIN_D, PAL.SKIN, PAL.WHITE];

/** #rrggbb に alpha を足す */
export function rgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** 2色を線形補間（フェード・ダメージ点滅用） */
export function mix(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
