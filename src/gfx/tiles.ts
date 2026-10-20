/**
 * 8x8 タイル。マップは data/maps.ts にアスキーアートで書けるよう、
 * 1文字 = 1タイル のキーで引く。
 */
import { PAL } from './palette';
import { Sprite, type SpriteDef } from './sprites';

export const TILE = 8;

export interface TileDef extends SpriteDef {
  /** 通行不可 */
  solid?: boolean;
  /** キャラより手前に描く（壁の上端・柱の上部など） */
  over?: boolean;
}

export class TileSet {
  private sprites = new Map<string, Sprite>();
  private defs: Record<string, TileDef>;

  constructor(defs: Record<string, TileDef>) {
    this.defs = defs;
    for (const [k, d] of Object.entries(defs)) this.sprites.set(k, new Sprite(d));
  }

  sprite(ch: string): Sprite | undefined { return this.sprites.get(ch); }
  solid(ch: string): boolean { return this.defs[ch]?.solid === true; }
  over(ch: string): boolean { return this.defs[ch]?.over === true; }
}

export class TileMap {
  readonly cols: number;
  readonly rows: number;
  private grid: string[][];

  constructor(private set: TileSet, ascii: readonly string[]) {
    this.grid = ascii.map((r) => [...r]);
    this.rows = this.grid.length;
    this.cols = this.grid.reduce((m, r) => Math.max(m, r.length), 0);
  }

  get pixelWidth(): number { return this.cols * TILE; }
  get pixelHeight(): number { return this.rows * TILE; }

  at(cx: number, cy: number): string {
    if (cy < 0 || cy >= this.rows) return '#';
    const row = this.grid[cy]!;
    if (cx < 0 || cx >= row.length) return '#';
    return row[cx] ?? ' ';
  }

  /** ピクセル座標が壁か */
  solidAtPx(x: number, y: number): boolean {
    return this.set.solid(this.at(Math.floor(x / TILE), Math.floor(y / TILE)));
  }

  /** 矩形が壁と重なるか（AABB 判定用） */
  rectHitsSolid(x: number, y: number, w: number, h: number): boolean {
    const x0 = Math.floor(x / TILE), x1 = Math.floor((x + w - 0.001) / TILE);
    const y0 = Math.floor(y / TILE), y1 = Math.floor((y + h - 0.001) / TILE);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this.set.solid(this.at(cx, cy))) return true;
      }
    }
    return false;
  }

  /** カメラ位置を考慮して可視範囲だけ描く。over=true なら手前レイヤのみ。 */
  draw(g: CanvasRenderingContext2D, camX: number, camY: number, viewW: number, viewH: number, overLayer = false): void {
    const x0 = Math.max(0, Math.floor(camX / TILE));
    const y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(this.cols - 1, Math.floor((camX + viewW) / TILE));
    const y1 = Math.min(this.rows - 1, Math.floor((camY + viewH) / TILE));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const ch = this.at(cx, cy);
        if (this.set.over(ch) !== overLayer) continue;
        const s = this.set.sprite(ch);
        if (!s) continue;
        g.drawImage(s.canvas, Math.round(cx * TILE - camX), Math.round(cy * TILE - camY));
      }
    }
  }
}

// ── カジノ／ホテルのタイルセット ─────────────────────────────────

const CARPET_P = [null, PAL.BLOOD, '#7d1620', '#5a0d14'] as const;
const MARBLE_P = [null, '#2a3040', '#343c4c', '#1c212b'] as const;
const WALL_P = [null, PAL.CHARCOAL, PAL.SLATE, PAL.INK, PAL.GOLD] as const;
const FELT_P = [null, PAL.FELT, PAL.FELT_L, PAL.FELT_D] as const;
const WOOD_P = [null, PAL.BROWN, PAL.BROWN_L, '#2f2118'] as const;

export const CASINO_TILES = new TileSet({
  // 赤絨毯
  '.': {
    palette: CARPET_P,
    rows: [
      '11111111', '11121112', '11111111', '21112111',
      '11111111', '11121112', '11111111', '21112111',
    ],
  },
  // 大理石の床
  ',': {
    palette: MARBLE_P,
    rows: [
      '22222221', '22222221', '22222221', '22222221',
      '22222221', '22222221', '22222221', '11111111',
    ],
  },
  // 壁
  '#': {
    solid: true,
    palette: WALL_P,
    rows: [
      '22222222', '21111112', '21111112', '21111112',
      '21111112', '21111112', '21111112', '33333333',
    ],
  },
  // 金の腰壁つき壁
  'W': {
    solid: true,
    palette: WALL_P,
    rows: [
      '22222222', '21111112', '21111112', '21111112',
      '24444442', '21111112', '21111112', '33333333',
    ],
  },
  // 壁の上端（キャラより手前）
  'T': {
    solid: true, over: true,
    palette: WALL_P,
    rows: [
      '33333333', '22222222', '21111112', '21111112',
      '21111112', '21111112', '21111112', '33333333',
    ],
  },
  // 柱（縦に2枚積む前提。継ぎ目が出ないよう縦方向は無地）
  'I': {
    solid: true,
    palette: WALL_P,
    rows: [
      '.322223.', '.211112.', '.211112.', '.211112.',
      '.211112.', '.211112.', '.211112.', '.322223.',
    ],
  },
  // ポーカーテーブルのフェルト
  'F': {
    solid: true,
    palette: FELT_P,
    rows: [
      '22222222', '21111112', '21111112', '21111112',
      '21111112', '21111112', '21111112', '33333333',
    ],
  },
  // 木の縁
  'B': {
    solid: true,
    palette: WOOD_P,
    rows: [
      '22222222', '11111111', '11111111', '33333333',
      '22222222', '11111111', '11111111', '33333333',
    ],
  },
  // 階段
  'S': {
    palette: [null, PAL.SILVER, PAL.STEEL, PAL.SLATE],
    rows: [
      '33333333', '11111111', '22222222', '33333333',
      '11111111', '22222222', '33333333', '11111111',
    ],
  },
  // 手すり：横方向（手前に描く・通行不可）
  'R': {
    solid: true, over: true,
    palette: [null, PAL.GOLD, PAL.GOLD_L, PAL.CHARCOAL],
    rows: [
      '33333333', '22222222', '11111111', '..1..1..',
      '..1..1..', '..1..1..', '..1..1..', '33333333',
    ],
  },
  // 手すり：縦方向。階段の脇に縦に積んでも継ぎ目が出ない。
  'V': {
    solid: true, over: true,
    palette: [null, PAL.GOLD, PAL.GOLD_L, PAL.CHARCOAL],
    rows: [
      '.3.221.3', '.3.221.3', '.3.221.3', '.3.221.3',
      '.3.221.3', '.3.221.3', '.3.221.3', '.3.221.3',
    ],
  },
  // 扉
  'D': {
    solid: true,
    palette: WOOD_P,
    rows: [
      '32222223', '21111112', '21111112', '21111112',
      '21111112', '21112112', '21111112', '33333333',
    ],
  },
  // ビロードのカーテン
  'C': {
    solid: true,
    palette: [null, PAL.BLOOD, '#8c1a26', PAL.VOID],
    rows: [
      '12112112', '12112112', '12112112', '12112112',
      '12112112', '12112112', '12112112', '12112112',
    ],
  },
  // 何もない（マップ外）
  ' ': { solid: true, palette: [null], rows: ['........', '........', '........', '........', '........', '........', '........', '........'] },
});
