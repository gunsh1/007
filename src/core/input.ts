/** 論理アクション。物理キーは KEYMAP で束ねる。 */
export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'light'    // 弱攻撃 / 決定 / 送り
  | 'heavy'    // 強攻撃 / 掴み
  | 'dodge'    // 回避ダッシュ
  | 'interact' // 調べる
  | 'observe'  // 観察（ポーカーの癖読み）
  | 'guide'    // 目的地を表示
  | 'aim'      // 構える
  | 'steady'   // 息を止める（震えを消す・足音を消す・一拍こらえる）
  | 'gadget'   // ガジェット（章ごとに中身が違う）
  | 'skip'     // 卓を飛ばす（テスト用）
  | 'cancel'
  | 'menu';

const KEYMAP: Record<string, Action> = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  KeyJ: 'light', Space: 'light', Enter: 'light',
  KeyK: 'heavy',
  ShiftLeft: 'dodge', ShiftRight: 'dodge',
  KeyE: 'interact',
  KeyQ: 'observe',
  KeyF: 'guide', KeyM: 'guide',
  KeyL: 'aim',
  KeyC: 'steady',
  KeyR: 'gadget',
  KeyP: 'skip',
  Escape: 'cancel', Backspace: 'cancel',
  Tab: 'menu',
};

/** デバッグメニューの開閉。KEYMAP には載せない生キー。 */
export const DEBUG_KEY = 'Backquote';

/** マウスの状態。ゲーム座標（384x216 系）で持つ。 */
export interface MouseState {
  x: number;
  y: number;
  /** 画面内にカーソルがあるか */
  inside: boolean;
  left: boolean;
  right: boolean;
  leftPressed: boolean;
  rightPressed: boolean;
}

export class Input {
  private down = new Set<Action>();
  private pressed = new Set<Action>();
  private released = new Set<Action>();

  private rawDown = new Set<string>();
  private rawPressed = new Set<string>();
  /** 暗証番号入力などで使う、このフレームに確定した文字列 */
  private typed = '';

  /** 照準用のマウス。ゲーム座標。 */
  readonly mouse: MouseState = {
    x: 192, y: 108, inside: false,
    left: false, right: false, leftPressed: false, rightPressed: false,
  };

  /** 入力を無視する（カットシーン等） */
  locked = false;

  constructor(target: EventTarget = window) {
    target.addEventListener('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    target.addEventListener('keyup', (e) => this.onKeyUp(e as KeyboardEvent));
    window.addEventListener('blur', () => this.clear());
  }

  /**
   * マウスを繋ぐ。座標変換は Display に任せる（レターボックスと整数倍拡大があるため）。
   * 右クリックのメニューは殺す（構えに使う）。
   */
  attachMouse(surface: HTMLElement, toGame: (cx: number, cy: number) => { x: number; y: number }): void {
    const move = (e: MouseEvent): void => {
      const p = toGame(e.clientX, e.clientY);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
      this.mouse.inside = p.x >= 0 && p.x <= 384 && p.y >= 0 && p.y <= 216;
    };
    surface.addEventListener('mousemove', move);
    surface.addEventListener('mousedown', (e) => {
      move(e);
      e.preventDefault();
      if (e.button === 0) { if (!this.mouse.left) this.mouse.leftPressed = true; this.mouse.left = true; }
      if (e.button === 2) { if (!this.mouse.right) this.mouse.rightPressed = true; this.mouse.right = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    surface.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    surface.addEventListener('mouseenter', () => { this.mouse.inside = true; });
  }

  /** 撃つ（左クリック or J） */
  get firePressed(): boolean {
    return !this.locked && (this.mouse.leftPressed || this.pressed.has('light'));
  }

  get fireHeld(): boolean {
    return !this.locked && (this.mouse.left || this.down.has('light'));
  }

  private onKeyDown(e: KeyboardEvent): void {
    // ブラウザ既定動作（スクロール・フォーカス移動・戻る）を全部殺す
    if (e.code in KEYMAP || e.code === DEBUG_KEY) e.preventDefault();
    if (e.repeat) return;

    if (!this.rawDown.has(e.code)) this.rawPressed.add(e.code);
    this.rawDown.add(e.code);

    if (e.key.length === 1) this.typed += e.key;

    const a = KEYMAP[e.code];
    if (!a) return;
    if (!this.down.has(a)) this.pressed.add(a);
    this.down.add(a);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.rawDown.delete(e.code);
    const a = KEYMAP[e.code];
    if (!a) return;
    // 同じアクションに複数キーが割り当たっている場合、まだ押されているなら維持
    const stillHeld = Object.entries(KEYMAP).some(
      ([code, act]) => act === a && this.rawDown.has(code),
    );
    if (stillHeld) return;
    this.down.delete(a);
    this.released.add(a);
  }

  private clear(): void {
    this.down.clear();
    this.rawDown.clear();
    this.pressed.clear();
    this.released.clear();
    this.typed = '';
    this.mouse.left = false;
    this.mouse.right = false;
  }

  isDown(a: Action): boolean { return !this.locked && this.down.has(a); }
  justPressed(a: Action): boolean { return !this.locked && this.pressed.has(a); }
  justReleased(a: Action): boolean { return !this.locked && this.released.has(a); }

  /** ロック中でも効く（デバッグメニュー用） */
  rawJustPressed(code: string): boolean { return this.rawPressed.has(code); }
  rawIsDown(code: string): boolean { return this.rawDown.has(code); }
  takeTyped(): string { const t = this.typed; this.typed = ''; return t; }

  /** -1 / 0 / +1 の移動入力 */
  axisX(): number { return (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0); }
  axisY(): number { return (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0); }

  /** 各フレームの update 後に呼ぶ */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
    this.rawPressed.clear();
    this.typed = '';
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
  }
}
