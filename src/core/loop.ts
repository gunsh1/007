/** 固定タイムステップ。物理と当たり判定を frame rate から切り離す。 */
export const STEP = 1 / 60;
const MAX_FRAME = 0.25; // タブ復帰時のスパイラル・オブ・デス防止

export class Loop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  /** 実行中の経過時間（秒）。演出の位相計算に使う。 */
  time = 0;
  /** 直近1秒の平均フレームレート（デバッグ表示用） */
  fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;

  constructor(
    private update: (dt: number) => void,
    private render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    let delta = (now - this.last) / 1000;
    this.last = now;
    if (delta > MAX_FRAME) delta = MAX_FRAME;

    this.acc += delta;
    while (this.acc >= STEP) {
      this.update(STEP);
      this.time += STEP;
      this.acc -= STEP;
    }
    this.render(this.acc / STEP);

    this.fpsAcc += delta;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
  };
}
