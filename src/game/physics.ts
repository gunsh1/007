import type { TileMap } from '../gfx/tiles';

export interface Box { x: number; y: number; w: number; h: number }

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function boxContains(b: Box, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
}

export function boxCenter(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/**
 * 軸ごとに分けて壁と解決する移動。斜め移動で壁に引っかかりにくい。
 * box は「足元の当たり判定」（見下ろしなのでキャラ全高ではなく足元だけ）。
 * 戻り値はぶつかった軸。
 */
export function moveBox(
  box: Box,
  dx: number,
  dy: number,
  map: TileMap,
  blockers: readonly Box[] = [],
): { hitX: boolean; hitY: boolean } {
  let hitX = false;
  let hitY = false;

  if (dx !== 0) {
    const nx = box.x + dx;
    if (blocked(nx, box.y, box.w, box.h, map, blockers)) {
      // 1px ずつ詰めて壁際まで寄せる
      const step = Math.sign(dx);
      let moved = 0;
      while (Math.abs(moved) < Math.abs(dx)) {
        if (blocked(box.x + step, box.y, box.w, box.h, map, blockers)) break;
        box.x += step;
        moved += step;
      }
      hitX = true;
    } else {
      box.x = nx;
    }
  }

  if (dy !== 0) {
    const ny = box.y + dy;
    if (blocked(box.x, ny, box.w, box.h, map, blockers)) {
      const step = Math.sign(dy);
      let moved = 0;
      while (Math.abs(moved) < Math.abs(dy)) {
        if (blocked(box.x, box.y + step, box.w, box.h, map, blockers)) break;
        box.y += step;
        moved += step;
      }
      hitY = true;
    } else {
      box.y = ny;
    }
  }

  return { hitX, hitY };
}

function blocked(x: number, y: number, w: number, h: number, map: TileMap, blockers: readonly Box[]): boolean {
  if (map.rectHitsSolid(x, y, w, h)) return true;
  const probe: Box = { x, y, w, h };
  for (const b of blockers) if (boxesOverlap(probe, b)) return true;
  return false;
}

/** 視線が通るか（壁で遮られていないか）。敵の索敵に使う。 */
export function lineOfSight(map: TileMap, ax: number, ay: number, bx: number, by: number): boolean {
  const d = dist(ax, ay, bx, by);
  const steps = Math.ceil(d / 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (map.solidAtPx(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}
