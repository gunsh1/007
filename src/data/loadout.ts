/**
 * 装備。任務の前に、持ち込むものを自分で決める。
 *
 * 枠は3つしかない。消音器を持てば静かに始められるが、そのぶん他を諦める。
 * 「攻め方を選べる」ことの土台がこれ。
 */
import type { GunId } from '../game/guns';

export type KitId =
  | 'ppk'        // 標準装備
  | 'silencer'   // 消音器（銃声が響かない）
  | 'spare'      // 予備弾倉（初期弾数が倍）
  | 'vest'       // 防弾ベスト（体力+1）
  | 'knife'      // ナイフ（無音の近接）
  | 'picks'      // 電子ロックピック（施錠を開けられる）
  | 'tracker'    // 発信機（目標の位置が常に見える）
  | 'smoke';     // 発煙筒（視界を切る）

export interface KitItem {
  id: KitId;
  name: string;
  note: string;
}

export const KIT: KitItem[] = [
  { id: 'ppk', name: 'ワルサーPPK', note: '7発。撃てば部屋の外まで響く' },
  { id: 'silencer', name: '消音器', note: 'PPKの銃声が届かなくなる（威力は落ちる）' },
  { id: 'spare', name: '予備弾倉', note: '持ち込む銃の初弾数が倍になる' },
  { id: 'vest', name: '防弾ベスト', note: '被弾に一発ぶん余裕ができる' },
  { id: 'knife', name: 'ナイフ', note: '無音の近接。弾を使わずに片づく' },
  { id: 'picks', name: '電子ロックピック', note: '施錠された扉と端末を開けられる' },
  { id: 'tracker', name: '発信機', note: '目標の位置が画面の端に出続ける' },
  { id: 'smoke', name: '発煙筒', note: '[R] で煙。視線を一度だけ切れる' },
];

export const SLOTS = 3;

/** 選んだ装備から、開始時の銃を決める */
export function startingGun(picked: readonly KitId[]): GunId | null {
  const hasPpk = picked.includes('ppk');
  if (hasPpk && picked.includes('silencer')) return 'ppkS';
  if (hasPpk) return 'ppk';
  if (picked.includes('knife')) return 'knife';
  return null;
}

export function has(picked: readonly KitId[], id: KitId): boolean {
  return picked.includes(id);
}
