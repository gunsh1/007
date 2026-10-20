/**
 * 章ごとのチップ収束。
 *
 * プレイヤーには自由に打たせつつ、章の入口で物語どおりの状況に丸める。
 * 「第5章で大敗し、フィリックスの資金で復帰し、最終ハンドで勝つ」という筋が、
 * ポーカーの結果に関わらず必ず成立するようにするための調整表。
 */
import type { ChapterId, SaveData } from '../core/save';

export interface ChipPlan {
  hero: number;
  chiffre: number;
  guests: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const BUY_IN = 10_000_000;
export const REBUY = 5_000_000;
export const PRIZE = 150_000_000;

export function chipPlan(id: ChapterId, save: SaveData): ChipPlan {
  switch (id) {
    // 第一夜。全員がバイ・インぶんだけ持っている。
    case 'ch03':
      return { hero: BUY_IN, chiffre: BUY_IN, guests: BUY_IN };

    // 再開。ボンドの成績は引き継ぐが、卓が壊れない範囲に収める。
    // ル・シッフルはこの間に他の参加者から取っている。
    case 'ch05':
      return { hero: clamp(save.chips, 8_000_000, 30_000_000), chiffre: 45_000_000, guests: 8_000_000 };

    // フィリックスの資金提供ぶんだけで再参加する。
    case 'ch06':
      return { hero: REBUY, chiffre: 60_000_000, guests: 6_000_000 };

    // 最終ハンド。ボンドは巻き返した後の状態から。
    case 'ch08':
      return { hero: clamp(save.chips, 20_000_000, 70_000_000), chiffre: 55_000_000, guests: 5_000_000 };

    default:
      return { hero: save.chips, chiffre: save.chiffreChips, guests: BUY_IN };
  }
}

/** 章の入口で呼ぶ。セーブのチップを物語の想定値へ寄せる。 */
export function applyChipPlan(save: SaveData, id: ChapterId): ChipPlan {
  const plan = chipPlan(id, save);
  save.chips = plan.hero;
  save.chiffreChips = plan.chiffre;
  return plan;
}
