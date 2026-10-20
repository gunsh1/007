import { GAME_W, GAME_H } from './display';
import type { Display } from './display';
import type { Input } from './input';
import type { Audio } from './audio';
import type { SaveData } from './save';

/** 全シーンに渡される共有コンテキスト */
export interface SceneCtx {
  readonly display: Display;
  readonly input: Input;
  readonly audio: Audio;
  readonly scenes: SceneStack;
  /** セーブデータ（進行フラグ・チップ・信頼度） */
  save: SaveData;
  /** 起動からの経過秒 */
  time: number;
  /** デバッグ用フラグ */
  debug: { invincible: boolean; showHitboxes: boolean; freeCamera: boolean; skipPoker: boolean };
}

export interface Scene {
  readonly name: string;
  onEnter?(ctx: SceneCtx): void;
  onExit?(ctx: SceneCtx): void;
  /** 上に別シーンが積まれた／外れた */
  onCover?(ctx: SceneCtx): void;
  onUncover?(ctx: SceneCtx): void;

  update(ctx: SceneCtx, dt: number): void;
  /** alpha は固定ステップ間の補間係数 */
  render(ctx: SceneCtx, alpha: number): void;

  /** true なら下のシーンも update される（ADVウィンドウを重ねる時など） */
  readonly transparentUpdate?: boolean;
  /** true なら下のシーンも render される */
  readonly transparentRender?: boolean;
  /**
   * true なら、このシーンを描く直前に UI レイヤ（文字）をクリアする。
   * UI レイヤはゲームレイヤ全体の上に乗るため、ゲームレイヤ側の fade では
   * 下のシーンが描いた日本語テキストを暗くできない。重ねる系のシーンは
   * これを立てて下の文字を消す。
   */
  readonly clearUIBelow?: boolean;
}

type Op =
  | { kind: 'push'; scene: Scene }
  | { kind: 'pop' }
  | { kind: 'replace'; scene: Scene }
  | { kind: 'reset'; scene: Scene };

/**
 * シーンスタック。update/render 中の破壊的変更を避けるため、
 * 操作はキューに積んで各フレーム末尾でまとめて適用する。
 */
export class SceneStack {
  private stack: Scene[] = [];
  private queue: Op[] = [];
  private ctx!: SceneCtx;

  bind(ctx: SceneCtx): void { this.ctx = ctx; }

  get current(): Scene | undefined { return this.stack[this.stack.length - 1]; }
  get depth(): number { return this.stack.length; }
  /** 現在積まれているシーン名（デバッグ表示用） */
  get names(): string[] { return this.stack.map((s) => s.name); }

  push(scene: Scene): void { this.queue.push({ kind: 'push', scene }); }
  pop(): void { this.queue.push({ kind: 'pop' }); }
  replace(scene: Scene): void { this.queue.push({ kind: 'replace', scene }); }
  /** スタックを全部捨てて1枚だけにする（章ジャンプ用） */
  reset(scene: Scene): void { this.queue.push({ kind: 'reset', scene }); }

  update(dt: number): void {
    // transparentUpdate が続く限り下へ降りて、下から順に update
    const targets: Scene[] = [];
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const s = this.stack[i]!;
      targets.push(s);
      if (!s.transparentUpdate) break;
    }
    for (let i = targets.length - 1; i >= 0; i--) targets[i]!.update(this.ctx, dt);
    this.flush();
  }

  render(alpha: number): void {
    const targets: Scene[] = [];
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const s = this.stack[i]!;
      targets.push(s);
      if (!s.transparentRender) break;
    }
    for (let i = targets.length - 1; i >= 0; i--) {
      const s = targets[i]!;
      if (s.clearUIBelow) {
        const ui = this.ctx.display.ui;
        ui.clearRect(0, 0, GAME_W, GAME_H);
      }
      s.render(this.ctx, alpha);
    }
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    const ops = this.queue;
    this.queue = [];
    for (const op of ops) {
      switch (op.kind) {
        case 'push': {
          this.current?.onCover?.(this.ctx);
          this.stack.push(op.scene);
          op.scene.onEnter?.(this.ctx);
          break;
        }
        case 'pop': {
          const s = this.stack.pop();
          s?.onExit?.(this.ctx);
          this.current?.onUncover?.(this.ctx);
          break;
        }
        case 'replace': {
          const s = this.stack.pop();
          s?.onExit?.(this.ctx);
          this.stack.push(op.scene);
          op.scene.onEnter?.(this.ctx);
          break;
        }
        case 'reset': {
          while (this.stack.length) this.stack.pop()?.onExit?.(this.ctx);
          this.stack.push(op.scene);
          op.scene.onEnter?.(this.ctx);
          break;
        }
      }
    }
  }
}
