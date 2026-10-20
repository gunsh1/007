/**
 * 道案内。[F] を押している間、目的地までの経路を点線で、目的地をエリアで示す。
 * 「どこへ行けばいいか分からない」を潰すための仕組み。
 */
import { GAME_W, GAME_H } from '../core/display';
import { PAL, rgba } from '../gfx/palette';
import { drawText } from '../gfx/text';
import type { TileMap } from '../gfx/tiles';
import { findPath, pathLength, samplePath, type Pt } from './pathfind';

export interface GuideTarget {
  x: number;
  y: number;
  label: string;
  /** エリア表示の半径 */
  radius?: number;
}

const DOT_SPACING = 7;

interface Cached { key: string; path: Pt[] }
let cache: Cached | null = null;

/** 経路はタイル単位でしか変わらないので、同じマスにいる間は再計算しない */
function pathFor(map: TileMap, from: Pt, to: Pt): Pt[] {
  const key = `${Math.floor(from.x / 8)},${Math.floor(from.y / 8)}>${Math.floor(to.x / 8)},${Math.floor(to.y / 8)}`;
  if (cache && cache.key === key) return cache.path;
  const path = findPath(map, from, to);
  cache = { key, path };
  return path;
}

export function clearGuideCache(): void { cache = null; }

/**
 * 目的地へのガイドを描く。
 *  active=true（[F]押下中）… 経路の点線＋エリア＋ラベルをすべて出す
 *  active=false            … 画面外なら端に小さな矢印だけ出す
 */
export function drawGuide(
  g: CanvasRenderingContext2D,
  ui: CanvasRenderingContext2D,
  map: TileMap,
  camX: number,
  camY: number,
  from: Pt,
  target: GuideTarget,
  time: number,
  active: boolean,
): void {
  const tx = Math.round(target.x - camX);
  const ty = Math.round(target.y - camY);
  const onScreen = tx > -20 && tx < GAME_W + 20 && ty > -20 && ty < GAME_H + 20;

  if (!active) {
    if (!onScreen) drawEdgeArrow(g, tx, ty, time);
    return;
  }

  // ── 目的地のエリア ──
  const r = target.radius ?? 18;
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.4);
  g.save();
  g.beginPath();
  g.arc(tx, ty, r, 0, Math.PI * 2);
  g.fillStyle = rgba(PAL.GOLD_L, 0.10 + pulse * 0.07);
  g.fill();
  g.strokeStyle = rgba(PAL.GOLD_L, 0.55 + pulse * 0.35);
  g.lineWidth = 1;
  g.setLineDash([3, 3]);
  g.lineDashOffset = -time * 14;
  g.beginPath();
  g.arc(tx + 0.5, ty + 0.5, r, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  g.restore();

  // 中心の十字
  g.fillStyle = rgba(PAL.GOLD_L, 0.9);
  g.fillRect(tx - 3, ty, 7, 1);
  g.fillRect(tx, ty - 3, 1, 7);

  // ── 経路の点線 ──
  const path = pathFor(map, from, { x: target.x, y: target.y });
  if (path.length > 1) {
    const total = pathLength(path);
    const phase = (time * 26) % DOT_SPACING;
    for (let d = phase + 8; d < total - 4; d += DOT_SPACING) {
      const p = samplePath(path, d);
      if (!p) break;
      const sx = Math.round(p.x - camX);
      const sy = Math.round(p.y - camY);
      if (sx < -4 || sx > GAME_W + 4 || sy < -4 || sy > GAME_H + 4) continue;
      // 進むほど明るく
      const a = 0.35 + 0.55 * (d / total);
      g.fillStyle = rgba(PAL.GOLD_L, a);
      g.fillRect(sx - 1, sy - 1, 2, 2);
    }
  } else {
    // 経路が引けない場合は直線で方向だけ示す
    g.strokeStyle = rgba(PAL.GOLD, 0.4);
    g.setLineDash([2, 4]);
    g.beginPath();
    g.moveTo(Math.round(from.x - camX), Math.round(from.y - camY));
    g.lineTo(tx, ty);
    g.stroke();
    g.setLineDash([]);
  }

  // ── ラベル ──
  if (onScreen) {
    const ly = Math.max(10, ty - r - 12);
    const lx = Math.max(34, Math.min(GAME_W - 34, tx));
    drawText(ui, target.label, lx, ly, {
      size: 8, color: PAL.GOLD_L, align: 'center', bold: true, outline: true,
    });
  } else {
    drawEdgeArrow(g, tx, ty, time);
    const dx = tx - GAME_W / 2;
    const dy = ty - GAME_H / 2;
    const glyph = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? '→' : '←') : (dy > 0 ? '↓' : '↑');
    drawText(ui, `${target.label} ${glyph}`, GAME_W / 2, 18, {
      size: 8, color: PAL.GOLD_L, align: 'center', bold: true, outline: true,
    });
  }
}

/** 画面外の目的地を指す、端の小さな三角 */
function drawEdgeArrow(g: CanvasRenderingContext2D, tx: number, ty: number, time: number): void {
  const cx = GAME_W / 2;
  const cy = GAME_H / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  const m = 16;
  const scale = Math.min((cx - m) / Math.abs(dx || 1), (cy - m) / Math.abs(dy || 1));
  const ex = cx + dx * scale;
  const ey = cy + dy * scale;
  const bob = Math.sin(time * 5) * 1.5;
  const ux = dx / len;
  const uy = dy / len;

  g.save();
  g.translate(Math.round(ex + ux * bob), Math.round(ey + uy * bob));
  g.rotate(Math.atan2(dy, dx));
  g.fillStyle = rgba(PAL.GOLD_L, 0.85);
  g.beginPath();
  g.moveTo(5, 0);
  g.lineTo(-4, -4);
  g.lineTo(-4, 4);
  g.closePath();
  g.fill();
  g.restore();
}

/** キャラクターの頭上に名前を出す */
export function drawNameTag(
  ui: CanvasRenderingContext2D,
  name: string,
  sx: number,
  sy: number,
  color: string = PAL.SILVER,
  emphasis = false,
): void {
  drawText(ui, name, Math.round(sx), Math.round(sy), {
    size: emphasis ? 7 : 6,
    color,
    align: 'center',
    outline: true,
    bold: emphasis,
  });
}

/** 調べられる物の上に出す小さな印 */
export function drawSpotMarker(g: CanvasRenderingContext2D, sx: number, sy: number, time: number, near: boolean): void {
  const bob = Math.round(Math.sin(time * 4) * 1.5);
  const col = near ? PAL.GOLD_L : rgba(PAL.SILVER, 0.55);
  g.fillStyle = col;
  const y = Math.round(sy) + bob;
  const x = Math.round(sx);
  // 下向きの小さな三角
  g.fillRect(x - 2, y, 5, 1);
  g.fillRect(x - 1, y + 1, 3, 1);
  g.fillRect(x, y + 2, 1, 1);
}
