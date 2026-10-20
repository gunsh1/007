/** ゲームレイヤ（低解像度）に描くドット絵的なUI部品。文字は text.ts 側で重ねる。 */
import { PAL, rgba } from './palette';
import { GAME_W, GAME_H } from '../core/display';

export interface PanelStyle {
  fill?: string;
  border?: string;
  accent?: string;
  /** 角を1px落とす */
  bevel?: boolean;
  alpha?: number;
}

/** ADVウィンドウ・メニュー枠。二重ボーダー + 角の金アクセント。 */
export function drawPanel(
  g: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  st: PanelStyle = {},
): void {
  const fill = st.fill ?? rgba(PAL.VOID, 0.88);
  const border = st.border ?? PAL.STEEL;
  const accent = st.accent ?? PAL.GOLD;
  const prev = g.globalAlpha;
  if (st.alpha !== undefined) g.globalAlpha = prev * st.alpha;

  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);

  g.fillStyle = fill;
  g.fillRect(x, y, w, h);

  g.fillStyle = border;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);

  // 内側の細いライン
  g.fillStyle = rgba(border, 0.45);
  g.fillRect(x + 2, y + 2, w - 4, 1);
  g.fillRect(x + 2, y + h - 3, w - 4, 1);
  g.fillRect(x + 2, y + 2, 1, h - 4);
  g.fillRect(x + w - 3, y + 2, 1, h - 4);

  // 四隅の金
  g.fillStyle = accent;
  for (const [cx, cy] of [[x, y], [x + w - 2, y], [x, y + h - 2], [x + w - 2, y + h - 2]] as const) {
    g.fillRect(cx, cy, 2, 2);
  }

  if (st.bevel) {
    g.clearRect(x, y, 1, 1);
    g.clearRect(x + w - 1, y, 1, 1);
    g.clearRect(x, y + h - 1, 1, 1);
    g.clearRect(x + w - 1, y + h - 1, 1, 1);
  }
  g.globalAlpha = prev;
}

/** HP・耐久などのバー */
export function drawBar(
  g: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  ratio: number,
  fg: string = PAL.RED, bg: string = PAL.CHARCOAL, frame: string = PAL.SLATE,
): void {
  x = Math.round(x); y = Math.round(y);
  const r = Math.max(0, Math.min(1, ratio));
  g.fillStyle = frame;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  g.fillStyle = fg;
  g.fillRect(x, y, Math.round(w * r), h);
  // 上端に1pxのハイライト
  g.fillStyle = rgba('#ffffff', 0.25);
  g.fillRect(x, y, Math.round(w * r), 1);
}

/** 画面全体のフェード */
export function fade(g: CanvasRenderingContext2D, amount: number, color: string = PAL.VOID): void {
  if (amount <= 0) return;
  g.fillStyle = rgba(color, Math.min(1, amount));
  g.fillRect(0, 0, GAME_W, GAME_H);
}

/** 四隅を落とすビネット。カジノの照明感を出す。 */
export function vignette(g: CanvasRenderingContext2D, strength = 0.55, color: string = PAL.VOID): void {
  const grad = g.createRadialGradient(
    GAME_W / 2, GAME_H / 2, GAME_H * 0.28,
    GAME_W / 2, GAME_H / 2, GAME_H * 0.85,
  );
  grad.addColorStop(0, rgba(color, 0));
  grad.addColorStop(1, rgba(color, strength));
  g.fillStyle = grad;
  g.fillRect(0, 0, GAME_W, GAME_H);
}

/** 走査線。かけすぎるとドットが死ぬので既定は薄く。 */
export function scanlines(g: CanvasRenderingContext2D, alpha = 0.08): void {
  g.fillStyle = rgba(PAL.VOID, alpha);
  for (let y = 0; y < GAME_H; y += 2) g.fillRect(0, y, GAME_W, 1);
}

/** 毒・被弾時の赤フラッシュ */
export function flash(g: CanvasRenderingContext2D, amount: number, color: string = PAL.RED): void {
  if (amount <= 0) return;
  g.fillStyle = rgba(color, Math.min(0.8, amount));
  g.fillRect(0, 0, GAME_W, GAME_H);
}

/** 上下のシネマスコープ帯 */
export function letterbox(g: CanvasRenderingContext2D, height: number): void {
  if (height <= 0) return;
  const h = Math.round(height);
  g.fillStyle = PAL.VOID;
  g.fillRect(0, 0, GAME_W, h);
  g.fillRect(0, GAME_H - h, GAME_W, h);
}

/** タイトル用のガンバレル演出（円 + 血の落下） */
export function gunBarrel(g: CanvasRenderingContext2D, t: number, cx = GAME_W / 2, cy = GAME_H / 2): void {
  const open = Math.min(1, t / 1.2);
  const r = 26 + open * 6;
  g.save();
  g.beginPath();
  g.rect(0, 0, GAME_W, GAME_H);
  g.arc(cx, cy, r, 0, Math.PI * 2, true);
  g.fillStyle = PAL.VOID;
  g.fill('evenodd');
  g.restore();

  g.strokeStyle = PAL.SILVER;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx + 0.5, cy + 0.5, r, 0, Math.PI * 2);
  g.stroke();

  // 照準の十字
  g.fillStyle = rgba(PAL.SILVER, 0.7);
  g.fillRect(cx - r, cy, r * 2, 1);
  g.fillRect(cx, cy - r, 1, r * 2);

  if (t > 1.4) {
    const bt = Math.min(1, (t - 1.4) / 1.6);
    g.fillStyle = PAL.BLOOD;
    g.fillRect(0, 0, GAME_W, Math.round(GAME_H * bt));
  }
}

/** 選択カーソル（右向き三角） */
export function cursor(g: CanvasRenderingContext2D, x: number, y: number, color: string = PAL.GOLD_L): void {
  g.fillStyle = color;
  x = Math.round(x); y = Math.round(y);
  for (let i = 0; i < 4; i++) g.fillRect(x + i, y + i, 1, 7 - i * 2);
}

/** 1px の枠線だけ引く（デバッグの当たり判定表示など） */
export function strokeRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  g.fillStyle = color;
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillRect(x + w - 1, y, 1, h);
}

/** 楕円の影。キャラの足元に敷く。 */
export function shadowEllipse(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.35): void {
  g.save();
  g.fillStyle = rgba(PAL.VOID, alpha);
  g.beginPath();
  g.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
