/**
 * ドット絵は外部画像を持たず、文字列配列 + パレットで TS 内に定義する。
 * 起動時に一度だけキャンバスへ焼き（ラスタライズ）、以後は drawImage するだけ。
 *
 *   '.' と ' ' = 透明 / '0'-'9' = palette[0..9] / 'a'-'z' = palette[10..35]
 */

export interface SpriteDef {
  /** 各行は同じ長さであること */
  rows: readonly string[];
  /** 索引 0 は原則 null（透明） */
  palette: readonly (string | null)[];
  /** 描画基準点。省略時は左上。キャラは足元中央にすると扱いやすい。 */
  pivot?: readonly [number, number];
}

function charIndex(c: string): number {
  if (c === '.' || c === ' ') return -1;
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 97 + 10;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 65 + 10;
  return -1;
}

export class Sprite {
  readonly w: number;
  readonly h: number;
  readonly px: number;
  readonly py: number;
  readonly canvas: HTMLCanvasElement;
  private silhouettes = new Map<string, HTMLCanvasElement>();

  constructor(def: SpriteDef, overrides?: Readonly<Record<number, string>>) {
    const h = def.rows.length;
    const w = h > 0 ? def.rows[0]!.length : 0;
    for (const r of def.rows) {
      if (r.length !== w) {
        throw new Error(`sprite row width mismatch: expected ${w}, got ${r.length} in "${r}"`);
      }
    }
    this.w = w;
    this.h = h;
    this.px = def.pivot ? def.pivot[0] : 0;
    this.py = def.pivot ? def.pivot[1] : 0;

    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;

    for (let y = 0; y < h; y++) {
      const row = def.rows[y]!;
      for (let x = 0; x < w; x++) {
        const i = charIndex(row[x]!);
        if (i < 0) continue;
        const col = overrides?.[i] ?? def.palette[i];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
    this.canvas = c;
  }

  /** 単色シルエット（ダメージ点滅・影・ハイライト用）。色ごとにキャッシュ。 */
  silhouette(color: string): HTMLCanvasElement {
    const hit = this.silhouettes.get(color);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.canvas, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    this.silhouettes.set(color, c);
    return c;
  }

  /** x,y は pivot 基準。座標は整数に丸めてドットの滲みを防ぐ。 */
  draw(g: CanvasRenderingContext2D, x: number, y: number, flipX = false): void {
    const dx = Math.round(x) - (flipX ? this.w - this.px : this.px);
    const dy = Math.round(y) - this.py;
    if (!flipX) {
      g.drawImage(this.canvas, dx, dy);
      return;
    }
    g.save();
    g.translate(dx + this.w, dy);
    g.scale(-1, 1);
    g.drawImage(this.canvas, 0, 0);
    g.restore();
  }

  drawSilhouette(g: CanvasRenderingContext2D, x: number, y: number, color: string, flipX = false): void {
    const img = this.silhouette(color);
    const dx = Math.round(x) - (flipX ? this.w - this.px : this.px);
    const dy = Math.round(y) - this.py;
    if (!flipX) {
      g.drawImage(img, dx, dy);
      return;
    }
    g.save();
    g.translate(dx + this.w, dy);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    g.restore();
  }
}

// ── アニメーション ───────────────────────────────────────────────

export interface AnimDef {
  frames: Sprite[];
  /** 1フレームあたりの秒数 */
  fps: number;
  loop?: boolean;
}

export class Animator {
  private t = 0;
  private idx = 0;
  private def: AnimDef;
  private key = '';
  finished = false;

  constructor(initial: AnimDef, key = 'default') {
    this.def = initial;
    this.key = key;
  }

  /** 同じ key なら再生位置を維持する */
  play(key: string, def: AnimDef, restart = false): void {
    if (this.key === key && !restart) return;
    this.key = key;
    this.def = def;
    this.t = 0;
    this.idx = 0;
    this.finished = false;
  }

  update(dt: number): void {
    const n = this.def.frames.length;
    if (n <= 1) { this.idx = 0; return; }
    const dur = 1 / Math.max(0.001, this.def.fps);
    this.t += dt;
    while (this.t >= dur) {
      this.t -= dur;
      if (this.idx + 1 >= n) {
        if (this.def.loop === false) { this.idx = n - 1; this.finished = true; return; }
        this.idx = 0;
      } else {
        this.idx++;
      }
    }
  }

  get frame(): Sprite { return this.def.frames[this.idx]!; }
  get frameIndex(): number { return this.idx; }
  get currentKey(): string { return this.key; }
}

// ── まとめてラスタライズするヘルパ ────────────────────────────────

export function makeSprites(defs: readonly SpriteDef[], overrides?: Readonly<Record<number, string>>): Sprite[] {
  return defs.map((d) => new Sprite(d, overrides));
}

export function anim(frames: Sprite[], fps: number, loop = true): AnimDef {
  return { frames, fps, loop };
}

/** 単色の矩形スプライトを即席で作る（プレースホルダ・エフェクト用） */
export function solidSprite(w: number, h: number, color: string, pivot?: readonly [number, number]): Sprite {
  const row = 'a'.repeat(w);
  return new Sprite({ rows: Array<string>(h).fill(row), palette: [null, ...Array<string>(9).fill(color), color], pivot });
}
