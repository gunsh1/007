/**
 * 2レイヤ描画。
 *
 *  #game … GAME_W x GAME_H (384x216) の低解像度キャンバス。ドット絵はここへ。
 *          CSS で整数倍に拡大される（image-rendering: pixelated）。
 *  #ui   … 同じ矩形に重ねた等倍(実デバイス解像度)キャンバス。日本語テキスト・
 *          ADVウィンドウ・HUD はここへ。ゲーム座標系のまま fillText できるよう
 *          ctx に scale 変換がかかっている。
 *
 * 日本語を 384x216 に焼くと潰れて読めないため、この分離が本作の描画の要。
 */

export const GAME_W = 384;
export const GAME_H = 216;

export class Display {
  readonly game: CanvasRenderingContext2D;
  readonly ui: CanvasRenderingContext2D;

  private stage: HTMLElement;
  private gameCanvas: HTMLCanvasElement;
  private uiCanvas: HTMLCanvasElement;

  /** ゲーム座標 → CSSピクセル の倍率（整数） */
  scale = 1;
  /** ゲーム座標 → UIキャンバスのバッキングピクセル の倍率（scale * dpr） */
  uiScale = 1;

  constructor() {
    this.stage = must(document.getElementById('stage'));
    this.gameCanvas = must(document.getElementById('game')) as HTMLCanvasElement;
    this.uiCanvas = must(document.getElementById('ui')) as HTMLCanvasElement;

    this.gameCanvas.width = GAME_W;
    this.gameCanvas.height = GAME_H;

    this.game = ctx2d(this.gameCanvas);
    this.ui = ctx2d(this.uiCanvas);
    this.game.imageSmoothingEnabled = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    const availW = window.innerWidth;
    const availH = window.innerHeight;
    const scale = Math.max(1, Math.floor(Math.min(availW / GAME_W, availH / GAME_H)));
    // devicePixelRatio は 3 まで。それ以上は文字の描画コストに見合わない。
    const dpr = Math.min(3, window.devicePixelRatio || 1);

    this.scale = scale;
    this.uiScale = scale * dpr;

    const cssW = GAME_W * scale;
    const cssH = GAME_H * scale;
    this.stage.style.width = `${cssW}px`;
    this.stage.style.height = `${cssH}px`;

    this.uiCanvas.width = Math.round(cssW * dpr);
    this.uiCanvas.height = Math.round(cssH * dpr);

    this.game.imageSmoothingEnabled = false;
    // UI 側はゲーム座標でそのまま描けるようにしておく（文字は高解像度で描かれる）
    this.ui.setTransform(this.uiScale, 0, 0, this.uiScale, 0, 0);
    this.ui.textBaseline = 'top';
  }

  /** マウスのクライアント座標 → ゲーム座標（384x216 系） */
  toGame(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.gameCanvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) / (r.width / GAME_W),
      y: (clientY - r.top) / (r.height / GAME_H),
    };
  }

  /** マウスイベントを拾う要素 */
  get surface(): HTMLElement { return this.stage; }

  /** 毎フレームの描画開始時に両レイヤをクリアする */
  begin(): void {
    this.game.setTransform(1, 0, 0, 1, 0, 0);
    this.game.imageSmoothingEnabled = false;
    this.game.clearRect(0, 0, GAME_W, GAME_H);

    this.ui.setTransform(this.uiScale, 0, 0, this.uiScale, 0, 0);
    this.ui.clearRect(0, 0, GAME_W, GAME_H);
  }
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { alpha: true });
  if (!ctx) throw new Error(`2d context unavailable: #${c.id}`);
  return ctx;
}

function must<T>(v: T | null): T {
  if (v == null) throw new Error('required DOM element missing');
  return v;
}
