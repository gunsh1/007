/**
 * 日本語テキストは UI レイヤ（実解像度）にだけ描く。
 * 座標・サイズはゲーム座標(384x216)基準で指定できる（display 側で scale 済み）。
 */

export const FONT_STACK = '"MS Gothic", "ＭＳ ゴシック", "Osaka-Mono", monospace';

export type Align = 'left' | 'center' | 'right';

export interface TextOpts {
  size?: number;          // ゲーム座標でのフォントサイズ（既定 8）
  color?: string;
  align?: Align;
  bold?: boolean;
  /** 1px の黒フチ。低解像度背景の上でも読めるようにする。 */
  outline?: boolean;
  outlineColor?: string;
  /** 右下に落とす影 */
  shadow?: boolean;
  alpha?: number;
  /** 文字間（ゲーム座標） */
  tracking?: number;
}

/** 行頭に来てはいけない文字 */
const NO_LINE_START = '、。，．・：；？！ヽヾゝゞ々ー）］｝〕〉》」』】’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ)]}>,.:;?!';
/** 行末に来てはいけない文字 */
const NO_LINE_END = '（［｛〔〈《「『【‘“([{<';

export function applyFont(ui: CanvasRenderingContext2D, size = 8, bold = false): void {
  ui.font = `${bold ? 'bold ' : ''}${size}px ${FONT_STACK}`;
}

export function measure(ui: CanvasRenderingContext2D, s: string, size = 8, bold = false): number {
  applyFont(ui, size, bold);
  return ui.measureText(s).width;
}

export function drawText(
  ui: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  opts: TextOpts = {},
): number {
  const size = opts.size ?? 8;
  const color = opts.color ?? '#e9eef6';
  const align = opts.align ?? 'left';
  const tracking = opts.tracking ?? 0;

  applyFont(ui, size, opts.bold);
  ui.textBaseline = 'top';

  const w = tracking === 0 ? ui.measureText(s).width : trackedWidth(ui, s, tracking);
  let sx = x;
  if (align === 'center') sx = x - w / 2;
  else if (align === 'right') sx = x - w;

  const prevAlpha = ui.globalAlpha;
  if (opts.alpha !== undefined) ui.globalAlpha = prevAlpha * opts.alpha;

  const put = (t: string, px: number, py: number, col: string): void => {
    ui.fillStyle = col;
    if (tracking === 0) { ui.fillText(t, px, py); return; }
    let cx = px;
    for (const ch of t) {
      ui.fillText(ch, cx, py);
      cx += ui.measureText(ch).width + tracking;
    }
  };

  if (opts.shadow) put(s, sx + 1, y + 1, 'rgba(0,0,0,0.75)');
  if (opts.outline) {
    const oc = opts.outlineColor ?? '#05060a';
    const d = Math.max(1, size / 8);
    put(s, sx - d, y, oc); put(s, sx + d, y, oc);
    put(s, sx, y - d, oc); put(s, sx, y + d, oc);
  }
  put(s, sx, y, color);

  ui.globalAlpha = prevAlpha;
  return w;
}

function trackedWidth(ui: CanvasRenderingContext2D, s: string, tracking: number): number {
  let w = 0;
  for (const ch of s) w += ui.measureText(ch).width + tracking;
  return w - tracking;
}

/**
 * 日本語向けの折り返し。単語境界ではなく文字単位で折り、簡易な禁則処理を行う。
 * '\n' は明示的な改行として扱う。
 */
export function wrap(
  ui: CanvasRenderingContext2D,
  s: string,
  maxWidth: number,
  size = 8,
  bold = false,
): string[] {
  applyFont(ui, size, bold);
  const out: string[] = [];

  for (const para of s.split('\n')) {
    if (para === '') { out.push(''); continue; }
    let line = '';
    let w = 0;
    const chars = [...para];
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i]!;
      const cw = ui.measureText(ch).width;
      if (w + cw > maxWidth && line !== '') {
        // 行頭禁則: この文字が行頭に来るなら前行に押し込む
        if (NO_LINE_START.includes(ch)) {
          out.push(line + ch);
          line = '';
          w = 0;
          continue;
        }
        // 行末禁則: 前の文字が行末に来られないなら一緒に送る
        const last = line[line.length - 1]!;
        if (NO_LINE_END.includes(last)) {
          line = line.slice(0, -1);
          out.push(line);
          line = last + ch;
          w = ui.measureText(line).width;
          continue;
        }
        out.push(line);
        line = ch;
        w = cw;
      } else {
        line += ch;
        w += cw;
      }
    }
    out.push(line);
  }
  return out;
}

export function drawLines(
  ui: CanvasRenderingContext2D,
  lines: readonly string[],
  x: number,
  y: number,
  lineHeight: number,
  opts: TextOpts = {},
): void {
  for (let i = 0; i < lines.length; i++) {
    drawText(ui, lines[i]!, x, y + i * lineHeight, opts);
  }
}

/**
 * タイプライタ表示。折り返し済みの行配列を受け取り、
 * 全体を通した文字数で徐々に開示する。
 */
export class Typewriter {
  private lines: string[] = [];
  private total = 0;
  private shown = 0;
  /** 1秒あたりの表示文字数 */
  cps = 42;

  set(lines: string[]): void {
    this.lines = lines;
    this.total = lines.reduce((n, l) => n + [...l].length, 0);
    this.shown = 0;
  }

  update(dt: number, fast: boolean): void {
    this.shown = Math.min(this.total, this.shown + this.cps * (fast ? 4 : 1) * dt);
  }

  skip(): void { this.shown = this.total; }
  get done(): boolean { return this.shown >= this.total; }
  /** 直近で新しい文字が出たか（打鍵音のトリガ用） */
  get shownCount(): number { return Math.floor(this.shown); }

  /** 表示途中の行配列 */
  visible(): string[] {
    let budget = Math.floor(this.shown);
    const out: string[] = [];
    for (const l of this.lines) {
      const chars = [...l];
      if (budget >= chars.length) {
        out.push(l);
        budget -= chars.length;
      } else {
        out.push(chars.slice(0, Math.max(0, budget)).join(''));
        budget = 0;
      }
    }
    return out;
  }
}
