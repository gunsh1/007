/**
 * 小物の描画。矩形の積み重ねで直接描く（スプライト定義より確実で編集しやすい）。
 * 車・椅子・グラス・除細動器など。
 */
import { PAL, rgba } from './palette';

export interface CarStyle {
  body: string;
  trim: string;
  glass: string;
  light: string;
  tail: string;
}

export const ASTON: CarStyle = {
  body: '#3d4550', trim: '#5c6675', glass: '#12161c', light: PAL.GOLD_L, tail: PAL.RED,
};
export const ENEMY_CAR: CarStyle = {
  body: '#2a2320', trim: '#3d332d', glass: '#0e1116', light: PAL.AMBER, tail: PAL.BLOOD,
};

export const CAR_W = 20;
export const CAR_H = 32;

/**
 * 見下ろしの車。x,y は左上。facingUp=false で 180 度回す（対向車）。
 * damage 0..1 で凹み・煙の量が変わる。
 */
export function drawCar(
  g: CanvasRenderingContext2D,
  x: number, y: number,
  st: CarStyle = ASTON,
  facingUp = true,
  damage = 0,
): void {
  x = Math.round(x); y = Math.round(y);
  g.save();
  if (!facingUp) {
    g.translate(x + CAR_W / 2, y + CAR_H / 2);
    g.rotate(Math.PI);
    g.translate(-CAR_W / 2, -CAR_H / 2);
  } else {
    g.translate(x, y);
  }

  // タイヤ
  g.fillStyle = '#0b0e15';
  g.fillRect(0, 6, 3, 6);
  g.fillRect(CAR_W - 3, 6, 3, 6);
  g.fillRect(0, CAR_H - 13, 3, 6);
  g.fillRect(CAR_W - 3, CAR_H - 13, 3, 6);

  // 車体
  g.fillStyle = st.body;
  g.fillRect(3, 2, CAR_W - 6, CAR_H - 4);
  g.fillRect(2, 5, CAR_W - 4, CAR_H - 10);
  // 縁のハイライト
  g.fillStyle = st.trim;
  g.fillRect(3, 2, CAR_W - 6, 1);
  g.fillRect(3, CAR_H - 3, CAR_W - 6, 1);
  g.fillRect(2, 6, 1, CAR_H - 12);
  g.fillRect(CAR_W - 3, 6, 1, CAR_H - 12);

  // ガラス
  g.fillStyle = st.glass;
  g.fillRect(5, 9, CAR_W - 10, 6);   // フロント
  g.fillRect(5, 19, CAR_W - 10, 5);  // リア
  // ルーフ
  g.fillStyle = st.trim;
  g.fillRect(5, 15, CAR_W - 10, 4);

  // ライト
  g.fillStyle = st.light;
  g.fillRect(4, 2, 3, 2);
  g.fillRect(CAR_W - 7, 2, 3, 2);
  g.fillStyle = st.tail;
  g.fillRect(4, CAR_H - 4, 3, 2);
  g.fillRect(CAR_W - 7, CAR_H - 4, 3, 2);

  if (damage > 0) {
    g.fillStyle = rgba('#1a1512', Math.min(0.8, damage));
    g.fillRect(4, 2, CAR_W - 8, Math.round(6 * damage));
    if (damage > 0.5) {
      g.fillStyle = rgba(PAL.RED, 0.5);
      g.fillRect(6, 3, 3, 2);
    }
  }
  g.restore();
}

/** ヘッドライトの光。夜のカーチェイス用。 */
export function drawHeadlights(g: CanvasRenderingContext2D, cx: number, y: number, length = 70, alpha = 0.18): void {
  const grad = g.createLinearGradient(cx, y, cx, y - length);
  grad.addColorStop(0, rgba(PAL.GOLD_L, alpha));
  grad.addColorStop(1, rgba(PAL.GOLD_L, 0));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(cx - 7, y);
  g.lineTo(cx - 26, y - length);
  g.lineTo(cx + 26, y - length);
  g.lineTo(cx + 7, y);
  g.closePath();
  g.fill();
}

/** 第10章の、座面が外された椅子（正面向き） */
export function drawArmlessChair(g: CanvasRenderingContext2D, x: number, y: number): void {
  x = Math.round(x); y = Math.round(y);
  const wood = '#3a2a1d';
  const dark = '#241a12';
  g.fillStyle = wood;
  // 背もたれ
  g.fillRect(x - 10, y - 30, 20, 3);
  g.fillRect(x - 10, y - 24, 20, 3);
  g.fillRect(x - 10, y - 30, 3, 22);
  g.fillRect(x + 7, y - 30, 3, 22);
  // 座面の枠（中央が抜けている）
  g.fillStyle = dark;
  g.fillRect(x - 12, y - 10, 24, 3);
  g.fillRect(x - 12, y - 10, 3, 3);
  g.fillRect(x + 9, y - 10, 3, 3);
  // 脚
  g.fillStyle = wood;
  g.fillRect(x - 11, y - 8, 3, 8);
  g.fillRect(x + 8, y - 8, 3, 8);
}

/**
 * 床に落ちたマチェット（第4章）。
 * 先に踏んだほうが持つ。落ちている間、刃が鈍く光る。
 */
export function drawMachete(g: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  x = Math.round(x); y = Math.round(y);
  const glint = 0.55 + 0.45 * Math.sin(time * 4);
  // 影
  g.fillStyle = rgba(PAL.VOID, 0.3);
  g.fillRect(x - 9, y + 1, 18, 2);
  // 刃
  g.fillStyle = PAL.SILVER;
  g.fillRect(x - 9, y - 3, 13, 3);
  g.fillStyle = rgba(PAL.WHITE, glint);
  g.fillRect(x - 8, y - 3, 11, 1);
  // 峰
  g.fillStyle = PAL.STEEL;
  g.fillRect(x - 9, y, 13, 1);
  // 柄
  g.fillStyle = '#2f2118';
  g.fillRect(x + 4, y - 2, 6, 3);
  g.fillStyle = PAL.BROWN_L;
  g.fillRect(x + 4, y - 2, 6, 1);
}

/** マティーニグラス */
export function drawMartini(g: CanvasRenderingContext2D, x: number, y: number, poisoned = false): void {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = PAL.SILVER;
  for (let i = 0; i < 5; i++) g.fillRect(x - 5 + i, y - 10 + i, 11 - i * 2, 1);
  g.fillRect(x - 1, y - 5, 2, 5);
  g.fillRect(x - 4, y, 8, 1);
  g.fillStyle = poisoned ? '#7ba05b' : '#d9d2a8';
  for (let i = 0; i < 3; i++) g.fillRect(x - 4 + i, y - 9 + i, 9 - i * 2, 1);
  g.fillStyle = PAL.GOLD_L;
  g.fillRect(x + 2, y - 9, 1, 1);
}

/** 除細動器（第7章）。パッドとケーブル。 */
export function drawDefib(g: CanvasRenderingContext2D, x: number, y: number, wireOut: boolean, charge = 0): void {
  x = Math.round(x); y = Math.round(y);
  g.fillStyle = '#c9c2b4';
  g.fillRect(x - 16, y - 10, 32, 20);
  g.fillStyle = '#2a2f3a';
  g.fillRect(x - 13, y - 7, 18, 12);
  g.fillStyle = charge > 0 ? PAL.GREEN_OK : '#1a2a1a';
  g.fillRect(x - 12, y - 6, Math.round(16 * Math.min(1, charge)), 3);
  // 表示部の心電図
  g.fillStyle = charge > 0 ? PAL.GOLD_L : PAL.STEEL;
  g.fillRect(x - 12, y - 1, 16, 1);
  // ケーブル
  g.strokeStyle = wireOut ? PAL.RED_L : PAL.SILVER;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + 6.5, y + 3.5);
  if (wireOut) {
    g.lineTo(x + 16.5, y + 10.5);
    g.lineTo(x + 22.5, y + 4.5);
  } else {
    g.lineTo(x + 18.5, y + 3.5);
    g.lineTo(x + 22.5, y - 2.5);
  }
  g.stroke();
  g.fillStyle = wireOut ? PAL.RED : PAL.SILVER;
  g.fillRect(x + 20, y + (wireOut ? 3 : -5), 5, 5);
}
