/**
 * 前編（原作 L.1〜L.47）のマップ。
 *
 * 銃撃ステージは「部屋が繋がっている」ことが要。壁で仕切って、
 * 扉と窓で線が通る場所を作る。どこから入るかを選べるよう、
 * どのマップにも入口は複数ある。
 */
import { TileMap, TILE } from '../gfx/tiles';
import { GridBuilder } from './maps';

export const px = (t: number): number => t * TILE;

// ── P00 プラハ：MI6 支局の夜 ────────────────────────────────────
// 48x34 = 384x272。トイレ → 廊下 → 局長室。狭くて短い、導入用。

export const P00 = {
  spawn: { x: px(6), y: px(28) },
  office: { x: px(38), y: px(7) },
  desk: { x: px(38), y: px(9) },
  door: { x: px(24), y: px(18) },
};

export function buildPrague(): TileMap {
  const b = new GridBuilder(48, 34, ' ');

  // 局長室（右上）
  b.rect(28, 2, 45, 14, ',');
  b.rect(27, 2, 27, 14, '#');
  b.rect(28, 1, 45, 1, 'W');
  b.rect(28, 0, 45, 0, 'T');
  b.rect(46, 2, 46, 14, '#');
  b.rect(28, 15, 45, 15, '#');
  b.table(34, 8, 42, 10);
  b.rect(30, 1, 34, 1, 'C');

  // 廊下（横一本）
  b.rect(4, 16, 45, 21, ',');
  b.rect(3, 16, 3, 21, '#');
  b.rect(46, 16, 46, 21, '#');
  b.rect(4, 22, 45, 22, '#');
  // 局長室への戸口
  b.rect(36, 15, 38, 15, ',');

  // 手洗い（左下）
  b.rect(4, 23, 20, 31, ',');
  b.rect(3, 23, 3, 31, '#');
  b.rect(21, 23, 21, 31, '#');
  b.rect(4, 32, 20, 32, '#');
  b.rect(4, 22, 12, 22, '#');
  b.rect(16, 22, 20, 22, '#');  // 廊下への抜け（13..15）
  b.table(5, 25, 9, 26);

  // 給湯室（右下・裏から回れる）
  b.rect(26, 23, 45, 31, ',');
  b.rect(25, 23, 25, 31, '#');
  b.rect(46, 23, 46, 31, '#');
  b.rect(26, 32, 45, 32, '#');
  b.rect(26, 22, 33, 22, '#');
  b.rect(37, 22, 45, 22, '#');  // 廊下への抜け（34..36）
  b.table(40, 25, 44, 27);
  b.column(30, 27);

  b.frame('#');
  return b.build();
}

// ── P01 マダガスカル：ナムブツ大使館 ────────────────────────────
// 76x54 = 608x432。中庭を囲む回廊。正面・側面・屋根裏の三方向から入れる。

export const P01 = {
  spawn: { x: px(38), y: px(50) },
  /** モロカが逃げ込む執務室 */
  moroka: { x: px(38), y: px(9) },
  /** 中庭のガスボンベ */
  tank: { x: px(30), y: px(28) },
  tank2: { x: px(46), y: px(28) },
  /** 逃走口 */
  escape: { x: px(70), y: px(50) },
};

export function buildEmbassy(): TileMap {
  const b = new GridBuilder(76, 54, ' ');

  // 外壁と敷地
  b.rect(2, 2, 73, 51, ',');
  b.rect(1, 1, 74, 1, 'W');
  b.rect(1, 0, 74, 0, 'T');
  b.rect(1, 2, 1, 51, '#');
  b.rect(74, 2, 74, 51, '#');
  b.rect(1, 52, 74, 52, '#');

  // 中庭（赤土）
  b.rect(20, 20, 55, 38, '.');

  // 執務室（北）
  b.rect(26, 4, 49, 14, ',');
  b.rect(25, 4, 25, 14, '#');
  b.rect(50, 4, 50, 14, '#');
  b.rect(26, 15, 35, 15, '#');
  b.rect(40, 15, 49, 15, '#');   // 戸口 36..39
  b.rect(28, 3, 34, 3, 'C');
  b.rect(42, 3, 48, 3, 'C');
  b.table(34, 8, 42, 10);

  // 東翼・西翼（回廊）
  b.rect(10, 18, 17, 40, ',');
  b.rect(9, 18, 9, 40, '#');
  b.rect(18, 18, 18, 27, '#');
  b.rect(18, 32, 18, 40, '#');   // 中庭への抜け 28..31
  b.rect(10, 17, 17, 17, '#');
  b.rect(10, 41, 17, 41, '#');

  b.rect(58, 18, 65, 40, ',');
  b.rect(66, 18, 66, 40, '#');
  b.rect(57, 18, 57, 27, '#');
  b.rect(57, 32, 57, 40, '#');   // 中庭への抜け 28..31
  b.rect(58, 17, 65, 17, '#');
  b.rect(58, 41, 65, 41, '#');

  // 南の門（開始地点）
  b.rect(30, 42, 45, 50, ',');
  b.rect(29, 42, 29, 50, '#');
  b.rect(46, 42, 46, 50, '#');
  b.rect(30, 41, 35, 41, '#');
  b.rect(40, 41, 45, 41, '#');   // 中庭への抜け 36..39
  b.put(37, 51, 'D').put(38, 51, 'D');

  // 中庭の遮蔽（柱と積み荷）
  for (const cx of [24, 34, 44, 52]) { b.column(cx, 24); b.column(cx, 35); }
  b.table(28, 26, 32, 28);
  b.table(44, 30, 48, 32);

  b.frame('#');
  return b.build();
}

// ── P02 Mの自宅：ロンドンのフラット ─────────────────────────────
// 52x36 = 416x288。玄関・寝室・書斎。撃つ場所ではない。

export const P02 = {
  spawn: { x: px(26), y: px(32) },
  pc: { x: px(43), y: px(8) },
  bedroom: { x: px(10), y: px(9) },
  balcony: { x: px(26), y: px(4) },
};

export function buildFlat(): TileMap {
  const b = new GridBuilder(52, 36, ' ');

  b.rect(3, 3, 48, 33, ',');
  b.rect(2, 2, 49, 2, 'W');
  b.rect(2, 1, 49, 1, 'T');
  b.rect(2, 3, 2, 33, '#');
  b.rect(49, 3, 49, 33, '#');
  b.rect(2, 34, 49, 34, '#');

  // 寝室（左上）
  b.rect(3, 13, 20, 13, '#');
  b.rect(20, 3, 20, 8, '#');
  b.rect(20, 11, 20, 13, '#');   // 戸口 9..10
  b.table(5, 6, 13, 10);         // ベッド

  // 書斎（右上）
  b.rect(32, 13, 48, 13, '#');
  b.rect(32, 3, 32, 6, '#');
  b.rect(32, 9, 32, 13, '#');    // 戸口 7..8
  b.table(38, 6, 46, 8);         // 机とPC

  // 玄関の廊下
  b.rect(24, 14, 28, 33, '.');
  b.put(25, 34, 'D').put(26, 34, 'D');

  // 居間の家具
  b.table(6, 20, 14, 23);
  b.table(38, 22, 46, 26);
  b.column(21, 24);
  b.column(31, 24);

  // バルコニー（上から入れる）
  b.rect(22, 2, 30, 2, 'C');

  b.frame('#');
  return b.build();
}

// ── P03 ナッソー：オーシャン・クラブ ───────────────────────────
// 64x44 = 512x352。ロビー・監視室・カジノ卓・駐車場。

export const P03 = {
  spawn: { x: px(32), y: px(40) },
  security: { x: px(9), y: px(8) },
  table: { x: px(46), y: px(14) },
  dimitrios: { x: px(46), y: px(10) },
  solange: { x: px(24), y: px(30) },
  car: { x: px(56), y: px(38) },
};

export function buildOceanClub(): TileMap {
  const b = new GridBuilder(64, 44, ' ');

  b.rect(3, 3, 60, 41, ',');
  b.rect(2, 2, 61, 2, 'W');
  b.rect(2, 1, 61, 1, 'T');
  b.rect(2, 3, 2, 41, '#');
  b.rect(61, 3, 61, 41, '#');
  b.rect(2, 42, 61, 42, '#');

  // 監視室（左上・施錠）
  b.rect(3, 14, 18, 14, '#');
  b.rect(18, 3, 18, 8, '#');
  b.rect(18, 11, 18, 14, '#');   // 戸口 9..10
  b.table(5, 6, 15, 8);          // モニタ卓

  // カジノの卓（右上）
  b.rect(34, 4, 58, 20, '.');
  b.table(40, 12, 52, 16);
  for (const cy of [8, 18]) { b.column(37, cy); b.column(55, cy); }

  // 中央のロビー
  b.rect(20, 16, 32, 30, ',');
  b.column(22, 20);
  b.column(30, 20);
  b.table(22, 26, 30, 28);

  // 駐車場（右下）
  b.rect(44, 30, 60, 41, '.');
  b.rect(43, 30, 43, 41, '#');
  b.rect(44, 29, 52, 29, '#');
  b.rect(56, 29, 60, 29, '#');   // 抜け 53..55

  b.put(31, 42, 'D').put(32, 42, 'D');
  b.rect(6, 2, 12, 2, 'C');
  b.rect(48, 2, 56, 2, 'C');

  b.frame('#');
  return b.build();
}

// ── P04 マイアミ：人体の世界展 ─────────────────────────────────
// 60x40 = 480x320。展示室が連なる。人混みの中で近づく。

export const P04 = {
  spawn: { x: px(30), y: px(36) },
  cloak: { x: px(8), y: px(34) },
  dimitrios: { x: px(46), y: px(9) },
  exit: { x: px(54), y: px(36) },
};

export function buildMuseum(): TileMap {
  const b = new GridBuilder(60, 40, ' ');

  b.rect(3, 3, 56, 37, ',');
  b.rect(2, 2, 57, 2, 'W');
  b.rect(2, 1, 57, 1, 'T');
  b.rect(2, 3, 2, 37, '#');
  b.rect(57, 3, 57, 37, '#');
  b.rect(2, 38, 57, 38, '#');

  // 展示ケース（島状に置いて、視線を切れるようにする）
  for (const [x, y] of [[10, 8], [22, 8], [34, 8], [46, 8], [16, 18], [28, 18], [40, 18], [10, 28], [24, 28], [38, 28], [50, 28]] as const) {
    b.table(x, y, x + 5, y + 2);
  }
  // クローク（左下）
  b.table(5, 33, 12, 35);
  // 柱
  for (const cy of [14, 24, 34]) { b.column(6, cy); b.column(54, cy); }

  b.put(29, 38, 'D').put(30, 38, 'D');
  b.frame('#');
  return b.build();
}

// ── P05 マイアミ国際空港：駐機場 ───────────────────────────────
// 80x48 = 640x384。ターミナルから機関室、そして滑走路へ。

export const P05 = {
  spawn: { x: px(8), y: px(42) },
  door: { x: px(30), y: px(30) },
  engineRoom: { x: px(40), y: px(10) },
  tanker: { x: px(68), y: px(40) },
};

export function buildAirport(): TileMap {
  const b = new GridBuilder(80, 48, ' ');

  // ターミナル（左）
  b.rect(3, 3, 30, 45, ',');
  b.rect(2, 2, 77, 2, 'W');
  b.rect(2, 1, 77, 1, 'T');
  b.rect(2, 3, 2, 45, '#');
  b.rect(2, 46, 77, 46, '#');
  b.rect(77, 3, 77, 45, '#');
  for (let x = 6; x < 28; x += 8) b.table(x, 12, x + 4, 14);
  for (let x = 6; x < 28; x += 8) b.table(x, 24, x + 4, 26);

  // 従業員通路（施錠された扉：解除コード ELLIPSIS）
  b.rect(31, 3, 31, 27, '#');
  b.rect(31, 33, 31, 45, '#');
  b.rect(31, 28, 31, 32, 'D');

  // 機関室（中央上）
  b.rect(32, 3, 52, 20, ',');
  b.rect(53, 3, 53, 20, '#');
  b.rect(32, 21, 44, 21, '#');
  b.rect(48, 21, 52, 21, '#');   // 抜け 45..47
  b.table(36, 8, 44, 12);
  b.column(34, 18);
  b.column(50, 18);

  // 駐機場（右）
  b.rect(32, 22, 76, 45, '.');
  b.rect(54, 3, 76, 21, '.');
  for (const cy of [28, 38]) { b.column(58, cy); b.column(70, cy); }
  b.table(60, 24, 74, 27);

  b.frame('#');
  return b.build();
}
