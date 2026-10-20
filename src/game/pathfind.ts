/** タイル単位の幅優先探索。目的地への道案内を引くために使う。 */
import { TILE, type TileMap } from '../gfx/tiles';

export interface Pt { x: number; y: number }

/**
 * from から to までの経路をピクセル座標の配列で返す。辿り着けなければ空配列。
 * 4近傍のみ（斜めに壁を抜けないように）。
 */
export function findPath(map: TileMap, from: Pt, to: Pt, maxNodes = 6000): Pt[] {
  const cols = map.cols;
  const rows = map.rows;
  const sx = Math.floor(from.x / TILE);
  const sy = Math.floor(from.y / TILE);
  const gx = Math.floor(to.x / TILE);
  const gy = Math.floor(to.y / TILE);
  if (sx === gx && sy === gy) return [{ x: to.x, y: to.y }];

  const idx = (x: number, y: number): number => y * cols + x;
  const walkable = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < cols && y < rows && !map.rectHitsSolid(x * TILE + 1, y * TILE + 1, TILE - 2, TILE - 2);

  // 目的地が壁の中なら、周囲の通れるマスへ寄せる
  let tgx = gx;
  let tgy = gy;
  if (!walkable(tgx, tgy)) {
    let best = -1;
    for (let r = 1; r <= 4 && best < 0; r++) {
      for (let dy = -r; dy <= r && best < 0; dy++) {
        for (let dx = -r; dx <= r && best < 0; dx++) {
          if (walkable(gx + dx, gy + dy)) { tgx = gx + dx; tgy = gy + dy; best = 1; }
        }
      }
    }
    if (best < 0) return [];
  }

  const prev = new Int32Array(cols * rows).fill(-1);
  const seen = new Uint8Array(cols * rows);
  const queue: number[] = [idx(sx, sy)];
  seen[idx(sx, sy)] = 1;
  let head = 0;
  let visited = 0;
  const goal = idx(tgx, tgy);
  let found = false;

  while (head < queue.length && visited < maxNodes) {
    const cur = queue[head++]!;
    visited++;
    if (cur === goal) { found = true; break; }
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    const nb = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const;
    for (const [nx, ny] of nb) {
      if (!walkable(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (seen[ni]) continue;
      seen[ni] = 1;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  if (!found) return [];

  const out: Pt[] = [];
  let cur = goal;
  while (cur !== -1) {
    const cx = cur % cols;
    const cy = (cur / cols) | 0;
    out.push({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 });
    if (cur === idx(sx, sy)) break;
    cur = prev[cur]!;
  }
  out.reverse();
  // 実際の始点・終点に差し替えて滑らかにする
  if (out.length > 0) {
    out[0] = { x: from.x, y: from.y };
    out[out.length - 1] = { x: to.x, y: to.y };
  }
  return out;
}

/** 折れ線の全長 */
export function pathLength(path: readonly Pt[]): number {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  return n;
}

/** 折れ線を距離 d の位置でサンプリング */
export function samplePath(path: readonly Pt[], d: number): Pt | null {
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= d) {
      const t = seg === 0 ? 0 : (d - acc) / seg;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += seg;
  }
  return null;
}
