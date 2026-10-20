import { GAME_W, GAME_H } from '../core/display';
import { clamp, lerp } from './physics';
import { fxRng } from '../core/rng';

/** 見下ろしビューのカメラ。画面左上のワールド座標を持つ。 */
export class Camera {
  x = 0;
  y = 0;
  /** 手ブレ（描画時のみ加算し、論理座標は汚さない） */
  private shakeT = 0;
  private shakeMag = 0;
  private ox = 0;
  private oy = 0;

  /** 追従の遅れ。0 で即時、1 に近いほどゆっくり。 */
  smoothing = 0.18;
  /** この矩形の外に出るまで追わない（画面中央からの許容ずれ） */
  deadzoneX = 18;
  deadzoneY = 12;

  constructor(public mapW = GAME_W, public mapH = GAME_H) {}

  setBounds(w: number, h: number): void { this.mapW = w; this.mapH = h; }

  /** 即座に対象を中央に置く（シーン開始時） */
  snapTo(tx: number, ty: number): void {
    this.x = tx - GAME_W / 2;
    this.y = ty - GAME_H / 2;
    this.clampToMap();
  }

  follow(tx: number, ty: number, dt: number): void {
    const cx = this.x + GAME_W / 2;
    const cy = this.y + GAME_H / 2;
    let dx = tx - cx;
    let dy = ty - cy;
    dx = Math.abs(dx) <= this.deadzoneX ? 0 : dx - Math.sign(dx) * this.deadzoneX;
    dy = Math.abs(dy) <= this.deadzoneY ? 0 : dy - Math.sign(dy) * this.deadzoneY;

    const t = 1 - Math.pow(this.smoothing, dt * 60);
    this.x = lerp(this.x, this.x + dx, t);
    this.y = lerp(this.y, this.y + dy, t);
    this.clampToMap();

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) * this.shakeMag;
      this.ox = fxRng.float(-k, k);
      this.oy = fxRng.float(-k, k);
    } else {
      this.ox = 0;
      this.oy = 0;
    }
  }

  shake(magnitude: number, seconds = 0.25): void {
    this.shakeMag = Math.max(this.shakeMag, magnitude / Math.max(0.01, seconds));
    this.shakeT = Math.max(this.shakeT, seconds);
  }

  private clampToMap(): void {
    // マップが画面より小さければ中央寄せ
    this.x = this.mapW <= GAME_W ? (this.mapW - GAME_W) / 2 : clamp(this.x, 0, this.mapW - GAME_W);
    this.y = this.mapH <= GAME_H ? (this.mapH - GAME_H) / 2 : clamp(this.y, 0, this.mapH - GAME_H);
  }

  /** 描画に使う座標（手ブレ込み・整数化） */
  get drawX(): number { return Math.round(this.x + this.ox); }
  get drawY(): number { return Math.round(this.y + this.oy); }
}
