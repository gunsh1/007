/**
 * 聞き込みで得られる情報と、それが後の章で顔を出すヒント。
 *
 * 難易度そのものは変えない。知っていれば「何を見ればいいか」が分かる、
 * という差だけをつける。知らなくても手は足りる。
 */
import type { SceneCtx } from '../core/scene';
import { hasIntel } from '../game/gossip';

/** intel の id → ミニゲーム中に出す一行 */
export const HINTS: Record<string, string> = {
  // 第2章 観察
  'guard-rhythm': 'グラスを置くたびに、護衛はこちらを振り返る',
  // 第4章 格闘
  'obanno': 'オバンノは三発続けて振ると、肩で息をする',
  'stairs': '手すりは古い。人一人ぶんの重さで折れる',
  // 第6章 接近
  'chiffre-habit': 'ル・シッフルは席を立つ前に、必ず時計を見る',
  // 第7章 除細動器
  'defib': '除細動器の端子は緩い。差す瞬間だけ、息を止めろ',
  // 第9章 追跡
  'road': '夜のこの道は、埃の舞い方で通った側が分かる',
  // 第10章 耐久
  'chiffre-fear': '金を溶かしたのは彼だ。時間がないのは、向こうのほうだ',
};

/** 持っていればヒント文を返す。持っていなければ null。 */
export function hint(ctx: SceneCtx, id: string): string | null {
  if (!hasIntel(ctx, id)) return null;
  return HINTS[id] ?? null;
}
