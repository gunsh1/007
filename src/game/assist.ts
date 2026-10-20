/**
 * アシスト。同じ場所で3回失敗したら、黙って少しだけ易しくする。
 *
 * 表示は出さない。詰まった側が気づかないうちに抜けられるのが望ましいので、
 * 「時間が伸びる」「相手の手数が減る」といった見えにくい方向にだけ効かせる。
 */
const fails = new Map<string, number>();

/** 失敗を記録する。 */
export function recordFail(id: string): void {
  fails.set(id, (fails.get(id) ?? 0) + 1);
}

/** 突破したら忘れる。 */
export function clearFails(id: string): void {
  fails.delete(id);
}

/** 0（素の難易度）〜3。3回失敗ごとに1段上がる。 */
export function assistLevel(id: string): number {
  return Math.min(3, Math.floor((fails.get(id) ?? 0) / 3));
}

/**
 * アシスト量 0..0.45。時間・耐久・猶予にそのまま掛けて使う。
 *   time * (1 + assist(id))      … 猶予が伸びる
 *   damage * (1 - assist(id))    … 痛みが減る
 */
export function assist(id: string): number {
  return assistLevel(id) * 0.15;
}

/** デバッグ・章のやり直し用 */
export function resetAllAssist(): void { fails.clear(); }
