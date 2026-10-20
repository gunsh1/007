/**
 * 調べられる「物」の見た目。見下ろし視点で、床や卓の上に置かれた小物として描く。
 *
 * 目的地を点線で示しても、そこに何が置いてあるか描かれていなければ結局分からない。
 * （例：医務の台に発信機が無ければ「GPSを埋め込む」と言われても場所が読めない）
 * ここで描く物は TopDownStage.props に登録され、キャラクターと同じ Y ソートに乗る。
 */
import { PAL, rgba } from './palette';
import { shadowEllipse } from './ui';

export type ItemKind =
  | 'dossier'   // 作戦資料のファイル
  | 'medkit'    // 医務の台（トレイ・注射器・発信機）
  | 'bell'      // フロントの呼び鈴と宿帳
  | 'martini'   // カクテルグラス
  | 'suitcase'  // 客室のスーツケース
  | 'chips'     // チップの山
  | 'phone'     // 受話器
  | 'case'      // アタッシェケース
  | 'none';     // 物は無い（場所そのものが目的）

/**
 * x,y は「床に接する中央」。active=true の間は足元が金色に脈打ち、
 * 遠くからでも「まだ調べていない物」だと分かる。
 */
export function drawItem(
  g: CanvasRenderingContext2D,
  kind: ItemKind,
  x: number,
  y: number,
  time: number,
  active: boolean,
): void {
  x = Math.round(x);
  y = Math.round(y);

  if (active) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
    g.fillStyle = rgba(PAL.GOLD_L, 0.08 + pulse * 0.10);
    g.beginPath();
    g.ellipse(x, y, 12, 5, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = rgba(PAL.GOLD_L, 0.22 + pulse * 0.38);
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x + 0.5, y + 0.5, 12, 5, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (kind !== 'none') {
    shadowEllipse(g, x, y, 8, 3, 0.3);
  }

  switch (kind) {
    case 'dossier': return drawDossier(g, x, y);
    case 'medkit': return drawMedkit(g, x, y, time);
    case 'bell': return drawBell(g, x, y);
    case 'martini': return drawGlasses(g, x, y);
    case 'suitcase': return drawSuitcase(g, x, y);
    case 'chips': return drawChips(g, x, y);
    case 'phone': return drawPhone(g, x, y);
    case 'case': return drawCase(g, x, y);
    default: return;
  }
}

/** 束ねた書類。斜めに重なった紙と、赤い機密印。 */
function drawDossier(g: CanvasRenderingContext2D, x: number, y: number): void {
  // 下の紙
  g.fillStyle = '#cfc7b2';
  g.fillRect(x - 8, y - 7, 15, 6);
  // 上の紙
  g.fillStyle = '#e6e0cf';
  g.fillRect(x - 7, y - 9, 15, 6);
  // 罫線
  g.fillStyle = '#a09a88';
  g.fillRect(x - 5, y - 7, 8, 1);
  g.fillRect(x - 5, y - 5, 6, 1);
  // ファイルの表紙
  g.fillStyle = PAL.BROWN_L;
  g.fillRect(x - 9, y - 5, 17, 5);
  g.fillStyle = PAL.BROWN;
  g.fillRect(x - 9, y - 5, 17, 1);
  g.fillStyle = '#2f2118';
  g.fillRect(x - 9, y - 1, 17, 1);
  // 機密印
  g.fillStyle = PAL.RED;
  g.fillRect(x + 2, y - 8, 4, 3);
  g.fillStyle = PAL.RED_L;
  g.fillRect(x + 3, y - 7, 2, 1);
}

/** 医務の台。トレイ・注射器・発信機（赤いランプが明滅する）。 */
function drawMedkit(g: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  // 白布のかかった台
  g.fillStyle = '#c9c2b4';
  g.fillRect(x - 10, y - 7, 20, 7);
  g.fillStyle = '#e9eef6';
  g.fillRect(x - 10, y - 7, 20, 1);
  g.fillStyle = '#8b9bb4';
  g.fillRect(x - 10, y - 1, 20, 1);

  // 赤十字
  g.fillStyle = PAL.RED;
  g.fillRect(x - 8, y - 5, 5, 1);
  g.fillRect(x - 6, y - 6, 1, 3);

  // 注射器（筒・押し子・針）
  g.fillStyle = PAL.WHITE;
  g.fillRect(x - 2, y - 5, 8, 2);
  g.fillStyle = PAL.STEEL;
  g.fillRect(x + 6, y - 5, 2, 2);
  g.fillStyle = PAL.SILVER;
  g.fillRect(x - 5, y - 5, 3, 1);
  g.fillStyle = rgba(PAL.GREEN_OK, 0.9);
  g.fillRect(x - 1, y - 5, 4, 2);

  // 発信機の粒。GPS のランプが明滅する。
  g.fillStyle = PAL.SILVER;
  g.fillRect(x + 2, y - 10, 5, 3);
  g.fillStyle = PAL.SLATE;
  g.fillRect(x + 3, y - 9, 3, 1);
  if (Math.floor(time * 2) % 2 === 0) {
    g.fillStyle = PAL.RED_L;
    g.fillRect(x + 6, y - 10, 1, 1);
  }
}

/** フロントの宿帳と呼び鈴。 */
function drawBell(g: CanvasRenderingContext2D, x: number, y: number): void {
  // 宿帳
  g.fillStyle = '#e6e0cf';
  g.fillRect(x - 10, y - 6, 11, 6);
  g.fillStyle = '#cfc7b2';
  g.fillRect(x - 10, y - 6, 11, 1);
  g.fillStyle = PAL.BROWN;
  g.fillRect(x - 5, y - 6, 1, 6);
  g.fillStyle = '#a09a88';
  g.fillRect(x - 9, y - 4, 3, 1);
  g.fillRect(x - 3, y - 4, 3, 1);

  // 呼び鈴（金のドーム）
  g.fillStyle = PAL.GOLD;
  g.fillRect(x + 3, y - 2, 8, 2);
  g.fillRect(x + 4, y - 5, 6, 3);
  g.fillRect(x + 5, y - 7, 4, 2);
  g.fillStyle = PAL.GOLD_L;
  g.fillRect(x + 5, y - 6, 2, 1);
  g.fillRect(x + 6, y - 8, 2, 1);
}

/** バーカウンターのグラス（マティーニ2脚）。 */
function drawGlasses(g: CanvasRenderingContext2D, x: number, y: number): void {
  for (const [ox, filled] of [[-5, '#d9d2a8'], [4, '#8ea86a']] as const) {
    const gx = x + ox;
    g.fillStyle = PAL.SILVER;
    for (let i = 0; i < 4; i++) g.fillRect(gx - 4 + i, y - 11 + i, 9 - i * 2, 1);
    g.fillRect(gx - 1, y - 7, 2, 6);
    g.fillRect(gx - 3, y - 1, 7, 1);
    g.fillStyle = filled;
    for (let i = 0; i < 3; i++) g.fillRect(gx - 3 + i, y - 10 + i, 7 - i * 2, 1);
  }
  g.fillStyle = PAL.GOLD_L;
  g.fillRect(x - 3, y - 10, 1, 1);
}

/** 荷物棚のスーツケース。 */
function drawSuitcase(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = PAL.BROWN;
  g.fillRect(x - 9, y - 12, 18, 12);
  g.fillStyle = PAL.BROWN_L;
  g.fillRect(x - 9, y - 12, 18, 1);
  g.fillStyle = '#2f2118';
  g.fillRect(x - 9, y - 1, 18, 1);
  // ベルト
  g.fillStyle = '#2f2118';
  g.fillRect(x - 6, y - 12, 2, 12);
  g.fillRect(x + 4, y - 12, 2, 12);
  // 留め金
  g.fillStyle = PAL.GOLD;
  g.fillRect(x - 6, y - 7, 2, 2);
  g.fillRect(x + 4, y - 7, 2, 2);
  // 取っ手
  g.fillStyle = PAL.GOLD;
  g.fillRect(x - 3, y - 15, 6, 1);
  g.fillRect(x - 3, y - 14, 1, 2);
  g.fillRect(x + 2, y - 14, 1, 2);
}

/** チップの山。 */
function drawChips(g: CanvasRenderingContext2D, x: number, y: number): void {
  const stacks: readonly (readonly [number, number, string])[] = [
    [-7, 5, PAL.RED], [0, 7, PAL.SILVER], [7, 4, PAL.GOLD],
  ];
  for (const [ox, n, col] of stacks) {
    for (let i = 0; i < n; i++) {
      const yy = y - 2 - i * 2;
      g.fillStyle = i % 2 === 0 ? col : PAL.WHITE;
      g.fillRect(x + ox - 3, yy, 7, 2);
      g.fillStyle = rgba(PAL.VOID, 0.35);
      g.fillRect(x + ox - 3, yy + 1, 7, 1);
    }
  }
}

/** 黒電話の受話器。 */
function drawPhone(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = PAL.INK;
  g.fillRect(x - 8, y - 5, 16, 5);
  g.fillStyle = PAL.CHARCOAL;
  g.fillRect(x - 8, y - 5, 16, 1);
  // 受話器
  g.fillStyle = '#1c222e';
  g.fillRect(x - 7, y - 8, 14, 3);
  g.fillStyle = PAL.SLATE;
  g.fillRect(x - 7, y - 8, 3, 3);
  g.fillRect(x + 4, y - 8, 3, 3);
  // ダイヤル
  g.fillStyle = PAL.GOLD;
  g.fillRect(x - 1, y - 3, 3, 2);
}

/** 資金のアタッシェケース。 */
function drawCase(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.fillStyle = PAL.SLATE;
  g.fillRect(x - 10, y - 8, 20, 8);
  g.fillStyle = PAL.STEEL;
  g.fillRect(x - 10, y - 8, 20, 1);
  g.fillStyle = PAL.INK;
  g.fillRect(x - 10, y - 1, 20, 1);
  g.fillRect(x - 10, y - 4, 20, 1);
  g.fillStyle = PAL.SILVER;
  g.fillRect(x - 6, y - 5, 3, 2);
  g.fillRect(x + 3, y - 5, 3, 2);
  g.fillStyle = PAL.GOLD;
  g.fillRect(x - 2, y - 11, 4, 1);
  g.fillRect(x - 2, y - 10, 1, 2);
  g.fillRect(x + 1, y - 10, 1, 2);
}
