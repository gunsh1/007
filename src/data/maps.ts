/**
 * マップ定義。1文字 = 8px タイル（gfx/tiles.ts の CASINO_TILES に対応）。
 * アスキーで直書きすると桁ずれが起きやすいので、小さなビルダで組む。
 *
 * 画面は 384x216。それより大きいマップはカメラがスクロールする。
 * 探索章は「歩いた」と感じられる広さを取り、目的地は [F] の道案内で示す。
 */
import { CASINO_TILES, TileMap, TILE } from '../gfx/tiles';

export class GridBuilder {
  private g: string[][];

  constructor(public w: number, public h: number, fill = '.') {
    this.g = Array.from({ length: h }, () => Array<string>(w).fill(fill));
  }

  put(x: number, y: number, ch: string): this {
    if (y >= 0 && y < this.h && x >= 0 && x < this.w) this.g[y]![x] = ch;
    return this;
  }

  rect(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.g[y]![x] = ch;
    }
    return this;
  }

  frame(ch = '#'): this {
    this.rect(0, 0, this.w - 1, 0, ch);
    this.rect(0, this.h - 1, this.w - 1, this.h - 1, ch);
    this.rect(0, 0, 0, this.h - 1, ch);
    this.rect(this.w - 1, 0, this.w - 1, this.h - 1, ch);
    return this;
  }

  border(x0: number, y0: number, x1: number, y1: number, ch: string): this {
    this.rect(x0, y0, x1, y0, ch);
    this.rect(x0, y1, x1, y1, ch);
    this.rect(x0, y0, x0, y1, ch);
    this.rect(x1, y0, x1, y1, ch);
    return this;
  }

  /** 柱（縦2枚組） */
  column(x: number, y: number): this { return this.put(x, y, 'I').put(x, y - 1, 'I'); }

  /** 什器（木枠＋天板） */
  table(x0: number, y0: number, x1: number, y1: number): this {
    this.rect(x0, y0, x1, y1, 'B');
    if (x1 - x0 >= 2 && y1 - y0 >= 1) this.rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, 'F');
    return this;
  }

  rows(): string[] { return this.g.map((r) => r.join('')); }
  build(): TileMap { return new TileMap(CASINO_TILES, this.rows()); }
}

export const px = (tiles: number): number => tiles * TILE;

// ── 第0章：MI6 本部（控えの間 → 通路 → Mの執務室） ────────────────
// 64x44 タイル = 512x352 px

export const CH00 = {
  spawn: { x: px(32), y: px(39) },
  mSeat: { x: px(32), y: px(7) },
  desk: { x: px(32), y: px(13) },
  dossier: { x: px(12), y: px(33) },
  tracker: { x: px(52), y: px(33) },
  window: { x: px(50), y: px(5) },
};

export function buildOffice(): TileMap {
  const b = new GridBuilder(64, 44, ' ');

  // Mの執務室（上）
  b.rect(4, 2, 59, 16, ',');
  b.rect(3, 1, 60, 1, 'W');
  b.rect(3, 0, 60, 0, 'T');
  b.rect(3, 2, 3, 16, '#');
  b.rect(60, 2, 60, 16, '#');
  b.rect(4, 17, 27, 17, '#');
  b.rect(36, 17, 59, 17, '#');
  b.rect(8, 1, 16, 1, 'C');
  b.rect(46, 1, 56, 1, 'C');
  b.table(24, 8, 39, 10);
  b.column(14, 13).column(49, 13);

  // 通路
  b.rect(28, 17, 35, 24, ',');
  b.rect(27, 17, 27, 24, '#');
  b.rect(36, 17, 36, 24, '#');

  // 控えの間（下）— ボンドの開始位置
  b.rect(4, 25, 59, 41, '.');
  b.rect(3, 25, 3, 41, '#');
  b.rect(60, 25, 60, 41, '#');
  b.rect(4, 24, 27, 24, '#');
  b.rect(36, 24, 59, 24, '#');
  b.rect(3, 42, 60, 42, '#');
  b.table(8, 29, 16, 31);     // 資料の卓
  b.table(48, 29, 56, 31);    // 医務の台
  b.column(20, 37).column(44, 37);
  b.put(31, 42, 'D').put(32, 42, 'D');

  b.frame('#');
  return b.build();
}

// ── 第1章：モンテネグロ行きの寝台列車 ────────────────────────────
// 140x26 タイル = 1120x208 px（横に長い）

export const CH01 = {
  spawn: { x: px(6), y: px(18) },
  vesper: { x: px(118), y: px(11) },
  vesperSpot: { x: px(117), y: px(19) },
  windowSpot: { x: px(34), y: px(16) },
  compartment: { x: px(70), y: px(16) },
  conductor: { x: px(52), y: px(18) },
  conductorSpot: { x: px(54), y: px(18) },
};

export function buildTrain(): TileMap {
  const b = new GridBuilder(140, 26, ' ');

  // 車内（上に客室、下に通路）。縦にも動ける幅を取る。
  b.rect(2, 9, 137, 21, ',');
  b.rect(1, 8, 138, 8, 'W');
  b.rect(1, 7, 138, 7, 'T');
  b.rect(1, 22, 138, 22, '#');
  b.rect(1, 9, 1, 21, '#');
  b.rect(138, 9, 138, 21, '#');

  // 窓
  for (let x = 6; x < 134; x += 10) b.rect(x, 8, x + 4, 8, 'C');
  // 客室の仕切りと座席（通路は rows 15..21 を空けておく）
  for (let x = 14; x < 100; x += 18) {
    b.rect(x, 9, x, 14, 'B');
    b.table(x + 2, 10, x + 9, 12);
  }
  // 車両の連結部（赤絨毯で区切りを見せる）
  for (let x = 40; x < 130; x += 30) b.rect(x - 1, 9, x + 1, 21, '.');

  // 食堂車（右端）
  b.rect(102, 9, 137, 21, '.');
  b.table(110, 12, 124, 17);
  b.table(128, 12, 134, 15);

  b.frame('#');
  return b.build();
}

// ── 第2章：ホテル・スプレンディド ─────────────────────────────────
// 88x56 タイル = 704x448 px（ロビー・バー翼・テラス・階段）

export const CH02 = {
  spawn: { x: px(44), y: px(50) },
  reception: { x: px(44), y: px(14) },
  receptionist: { x: px(44), y: px(7) },
  bar: { x: px(15), y: px(32) },
  mathis: { x: px(15), y: px(25) },
  chief: { x: px(74), y: px(25) },
  briber: { x: px(74), y: px(33) },
  /** 署長の護衛。ロビー側を向いたり戻ったりする。 */
  guard: { x: px(67), y: px(29) },
  vesper: { x: px(48), y: px(48) },
  terraceDoor: { x: px(64), y: px(28) },
  stairs: { x: px(76), y: px(46) },
};

export function buildHotelLobby(): TileMap {
  const b = new GridBuilder(88, 56, ' ');

  b.rect(3, 2, 84, 53, ',');
  b.rect(2, 1, 85, 1, 'W');
  b.rect(2, 0, 85, 0, 'T');
  b.rect(2, 2, 2, 53, '#');
  b.rect(85, 2, 85, 53, '#');
  b.rect(2, 54, 85, 54, '#');

  // 中央の赤絨毯
  b.rect(36, 2, 52, 53, '.');
  // フロント
  b.table(34, 8, 54, 11);
  // バー翼（左）。開口は rows 25..31
  b.rect(24, 18, 24, 24, '#');
  b.rect(24, 32, 24, 38, '#');
  b.table(8, 26, 22, 29);
  // テラス（右）。開口は rows 27..29
  b.rect(63, 20, 63, 26, '#');
  b.rect(63, 30, 63, 36, '#');
  b.rect(64, 20, 80, 36, '.');
  b.table(70, 26, 78, 30);
  // 階段（右下）
  b.rect(70, 42, 82, 52, 'S');
  b.rect(69, 42, 69, 52, 'V');
  // 柱
  for (const cy of [10, 20, 30, 40, 50]) { b.column(30, cy); b.column(58, cy); }
  // カーテンと玄関
  b.rect(8, 1, 18, 1, 'C');
  b.rect(70, 1, 80, 1, 'C');
  b.put(43, 54, 'D').put(44, 54, 'D');

  b.frame('#');
  return b.build();
}

// ── 第4章：銀の階段 ─────────────────────────────────────────────
// 60x60 タイル = 480x480 px。踊り場は画面幅いっぱいの広さ。

export const CH04 = {
  spawn: { x: px(30), y: px(55) },
  /** ここより上に入ると襲撃が始まる */
  triggerY: px(41),
  landingCenter: { x: px(30), y: px(30) },
  obannoSpawn: { x: px(22), y: px(26) },
  thugSpawn: { x: px(38), y: px(26) },
  vesperSpawn: { x: px(36), y: px(54) },
  doorTop: { x: px(30), y: px(5) },
  /** 踊り場から階段へ抜ける口。ここへ投げると転落する。 */
  throwZones: [
    { x: px(30), y: px(19), r: 46 },
    { x: px(30), y: px(42), r: 46 },
  ],
};

export function buildStairwell(): TileMap {
  const b = new GridBuilder(60, 60, ' ');

  // 上の廊下（ル・シッフルの階）
  b.rect(4, 2, 55, 10, ',');
  b.rect(3, 1, 56, 1, 'W');
  b.rect(3, 0, 56, 0, 'T');
  b.rect(3, 2, 3, 10, '#');
  b.rect(56, 2, 56, 10, '#');
  b.rect(4, 11, 21, 11, '#');
  b.rect(38, 11, 55, 11, '#');
  b.put(29, 1, 'D').put(30, 1, 'D');
  b.rect(6, 1, 12, 1, 'C');
  b.rect(47, 1, 53, 1, 'C');

  // 上の階段
  b.rect(22, 11, 37, 19, 'S');
  b.rect(21, 11, 21, 19, 'V');
  b.rect(38, 11, 38, 19, 'V');

  // 踊り場（戦闘アリーナ）
  b.rect(5, 20, 54, 40, ',');
  b.rect(4, 20, 4, 40, '#');
  b.rect(55, 20, 55, 40, '#');
  b.rect(5, 19, 21, 19, '#');
  b.rect(38, 19, 54, 19, '#');
  b.rect(5, 41, 21, 41, '#');
  b.rect(38, 41, 54, 41, '#');
  b.column(10, 25).column(49, 25);
  b.column(10, 36).column(49, 36);
  b.rect(5, 30, 8, 30, 'B');
  b.rect(51, 30, 54, 30, 'B');

  // 下の階段
  b.rect(22, 41, 37, 50, 'S');
  b.rect(21, 41, 21, 50, 'V');
  b.rect(38, 41, 38, 50, 'V');

  // 下の廊下（開始地点）
  b.rect(4, 51, 55, 57, '.');
  b.rect(3, 51, 3, 57, '#');
  b.rect(56, 51, 56, 57, '#');
  b.rect(4, 50, 21, 50, '#');
  b.rect(38, 50, 55, 50, '#');
  b.rect(3, 58, 56, 58, '#');

  b.frame('#');
  return b.build();
}

// ── 第7章：カジノ → 通路 → 駐車場 ───────────────────────────────
// 56x64 タイル = 448x512 px

export const CH07 = {
  spawn: { x: px(28), y: px(6) },
  car: { x: px(20), y: px(56) },
  corridor: { x: px(28), y: px(28) },
};

export function buildEscape(): TileMap {
  const b = new GridBuilder(56, 64, ' ');

  // カジノの床（上）
  b.rect(3, 2, 52, 20, '.');
  b.rect(2, 1, 53, 1, 'W');
  b.rect(2, 0, 53, 0, 'T');
  b.rect(2, 2, 2, 20, '#');
  b.rect(53, 2, 53, 20, '#');
  b.rect(3, 21, 23, 21, '#');
  b.rect(32, 21, 52, 21, '#');
  b.rect(10, 1, 20, 1, 'C');
  b.rect(36, 1, 46, 1, 'C');
  b.table(8, 10, 18, 13);
  b.table(38, 10, 48, 13);

  // 通路
  b.rect(24, 21, 31, 36, ',');
  b.rect(23, 21, 23, 36, '#');
  b.rect(32, 21, 32, 36, '#');

  // 駐車場（下）
  b.rect(3, 37, 52, 62, ',');
  b.rect(2, 37, 2, 62, '#');
  b.rect(53, 37, 53, 62, '#');
  b.rect(3, 36, 23, 36, '#');
  b.rect(32, 36, 52, 36, '#');
  b.rect(2, 63, 53, 63, '#');
  for (const cy of [44, 52, 60]) { b.column(9, cy); b.column(46, cy); }

  b.frame('#');
  return b.build();
}

// ── 第10章：地下倉庫（拷問） ─────────────────────────────────────

export const CH10 = {
  spawn: { x: px(16), y: px(14) },
};

export function buildCellar(): TileMap {
  const b = new GridBuilder(32, 20, ' ');
  b.rect(2, 2, 29, 17, ',');
  b.border(1, 1, 30, 18, '#');
  b.rect(1, 0, 30, 0, 'T');
  b.column(8, 6).column(23, 6);
  b.column(8, 14).column(23, 14);
  b.frame('#');
  return b.build();
}
