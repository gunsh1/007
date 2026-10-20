/**
 * トランプの描画。52枚ぶんのスプライトを起動時に焼いてキャッシュする。
 * ランクとスートは 5x5 のドットグリフ。18x24 のカードに収まる大きさ。
 */
import { PAL } from './palette';
import { isRed, rankOf, suitOf, type Card } from '../poker/cards';

export const CARD_W = 18;
export const CARD_H = 24;

/** 5x5 のランクグリフ。索引は rank（0=2 ... 12=A） */
const RANK_GLYPHS: readonly string[][] = [
  ['1111.', '....1', '.111.', '1....', '11111'], // 2
  ['1111.', '....1', '.111.', '....1', '1111.'], // 3
  ['1..1.', '1..1.', '11111', '...1.', '...1.'], // 4
  ['11111', '1....', '1111.', '....1', '1111.'], // 5
  ['.1111', '1....', '1111.', '1...1', '.111.'], // 6
  ['11111', '....1', '...1.', '..1..', '..1..'], // 7
  ['.111.', '1...1', '.111.', '1...1', '.111.'], // 8
  ['.111.', '1...1', '.1111', '....1', '1111.'], // 9
  ['1.111', '1.1.1', '1.1.1', '1.1.1', '1.111'], // 10
  ['..111', '...1.', '...1.', '1..1.', '.11..'], // J
  ['.111.', '1...1', '1.1.1', '1..1.', '.11.1'], // Q
  ['1...1', '1..1.', '111..', '1..1.', '1...1'], // K
  ['.111.', '1...1', '11111', '1...1', '1...1'], // A
];

/** 5x5 のスートピップ。索引は suit（0=♣ 1=♦ 2=♥ 3=♠） */
const SUIT_GLYPHS: readonly string[][] = [
  ['.1.1.', '.111.', '11111', '..1..', '.111.'], // ♣
  ['..1..', '.111.', '11111', '.111.', '..1..'], // ♦
  ['.1.1.', '11111', '11111', '.111.', '..1..'], // ♥
  ['..1..', '.111.', '11111', '.1.1.', '.111.'], // ♠
];

function stamp(g: CanvasRenderingContext2D, glyph: readonly string[], x: number, y: number, color: string): void {
  g.fillStyle = color;
  for (let r = 0; r < glyph.length; r++) {
    const row = glyph[r]!;
    for (let c = 0; c < row.length; c++) if (row[c] === '1') g.fillRect(x + c, y + r, 1, 1);
  }
}

function blankCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function faceBase(g: CanvasRenderingContext2D): void {
  // 角を落とした白い札
  g.fillStyle = PAL.WHITE;
  g.fillRect(1, 0, CARD_W - 2, CARD_H);
  g.fillRect(0, 1, CARD_W, CARD_H - 2);
  g.fillStyle = '#b9c2ce';
  g.fillRect(1, 0, CARD_W - 2, 1);
  g.fillRect(1, CARD_H - 1, CARD_W - 2, 1);
  g.fillRect(0, 1, 1, CARD_H - 2);
  g.fillRect(CARD_W - 1, 1, 1, CARD_H - 2);
}

const faceCache = new Map<Card, HTMLCanvasElement>();
let backCache: HTMLCanvasElement | null = null;

export function cardFace(card: Card): HTMLCanvasElement {
  const hit = faceCache.get(card);
  if (hit) return hit;
  const [c, g] = blankCanvas(CARD_W, CARD_H);
  faceBase(g);
  const col = isRed(card) ? PAL.RED : PAL.INK;
  stamp(g, RANK_GLYPHS[rankOf(card)]!, 2, 2, col);
  stamp(g, SUIT_GLYPHS[suitOf(card)]!, 2, 8, col);
  // 右下に反転したスート
  g.save();
  g.translate(CARD_W - 2, CARD_H - 2);
  g.rotate(Math.PI);
  stamp(g, SUIT_GLYPHS[suitOf(card)]!, 0, 0, col);
  g.restore();
  faceCache.set(card, c);
  return c;
}

export function cardBack(): HTMLCanvasElement {
  if (backCache) return backCache;
  const [c, g] = blankCanvas(CARD_W, CARD_H);
  g.fillStyle = PAL.BLOOD;
  g.fillRect(1, 0, CARD_W - 2, CARD_H);
  g.fillRect(0, 1, CARD_W, CARD_H - 2);
  g.fillStyle = '#8c1a26';
  for (let y = 2; y < CARD_H - 2; y += 2) {
    for (let x = 2 + (y % 4 === 0 ? 0 : 1); x < CARD_W - 2; x += 2) g.fillRect(x, y, 1, 1);
  }
  g.fillStyle = PAL.GOLD;
  g.fillRect(2, 2, CARD_W - 4, 1);
  g.fillRect(2, CARD_H - 3, CARD_W - 4, 1);
  backCache = c;
  return backCache;
}

/**
 * カードを描く。card が null なら裏面。
 * scale は整数のみ（ドットを潰さないため）。
 */
export function drawCard(
  g: CanvasRenderingContext2D,
  card: Card | null,
  x: number,
  y: number,
  scale = 1,
  alpha = 1,
): void {
  const img = card === null ? cardBack() : cardFace(card);
  const s = Math.max(1, Math.round(scale));
  const prev = g.globalAlpha;
  if (alpha !== 1) g.globalAlpha = prev * alpha;
  g.drawImage(img, Math.round(x), Math.round(y), CARD_W * s, CARD_H * s);
  g.globalAlpha = prev;
}

/** 勝ち役を構成したカードを光らせる枠 */
export function highlightCard(g: CanvasRenderingContext2D, x: number, y: number, scale = 1, color: string = PAL.GOLD_L): void {
  const s = Math.max(1, Math.round(scale));
  const w = CARD_W * s;
  const h = CARD_H * s;
  g.fillStyle = color;
  g.fillRect(Math.round(x) - 1, Math.round(y) - 1, w + 2, 1);
  g.fillRect(Math.round(x) - 1, Math.round(y) + h, w + 2, 1);
  g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, h + 2);
  g.fillRect(Math.round(x) + w, Math.round(y) - 1, 1, h + 2);
}

// ── チップ ───────────────────────────────────────────────────

const CHIP_COLORS: readonly [number, string, string][] = [
  [1_000_000, PAL.WHITE, '#b9c2ce'],
  [5_000_000, PAL.RED, PAL.BLOOD],
  [10_000_000, PAL.NAVY, '#0d1830'],
  [25_000_000, PAL.FELT, PAL.FELT_D],
  [50_000_000, PAL.GOLD, '#8a6f18'],
];

/** 金額に応じたチップの山を描く（幅6・1枚2px） */
export function drawChipStack(g: CanvasRenderingContext2D, x: number, y: number, amount: number): void {
  if (amount <= 0) return;
  // 金額の桁で山の高さを決める（最大6枚）
  const n = Math.max(1, Math.min(6, Math.round(Math.log10(Math.max(1, amount / 500_000)) * 2)));
  let tier = CHIP_COLORS[0]!;
  for (const t of CHIP_COLORS) if (amount >= t[0]) tier = t;
  const bx = Math.round(x) - 3;
  for (let i = 0; i < n; i++) {
    const by = Math.round(y) - i * 2;
    g.fillStyle = tier[2];
    g.fillRect(bx, by - 1, 6, 2);
    g.fillStyle = tier[1];
    g.fillRect(bx, by - 1, 6, 1);
    g.fillStyle = tier[2];
    g.fillRect(bx + 2, by - 1, 2, 1);
  }
}
