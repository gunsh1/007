/**
 * WebAudio による完全手続き生成のサウンド。音声ファイルは一切持たない。
 * BGM も既存曲は使わず、短調のオスティナートを自作している。
 *
 * ブラウザの自動再生ポリシーのため、最初のキー入力で unlock() すること。
 */

export type SfxName =
  | 'ui.move' | 'ui.confirm' | 'ui.cancel' | 'ui.error'
  | 'step' | 'door' | 'pickup'
  | 'punch' | 'punch.heavy' | 'hit' | 'whiff' | 'dodge' | 'bodyfall'
  | 'gunshot' | 'reload' | 'click.empty' | 'shell'
  | 'chip' | 'chips.push' | 'card' | 'card.flip'
  | 'heartbeat' | 'shock' | 'glass' | 'tick'
  | 'sting';

export type MusicTrack = 'none' | 'calm' | 'tension' | 'casino' | 'combat' | 'dread';

interface Note { at: number; freq: number; dur: number; gain: number; type: OscillatorType }

/** 半音 → 周波数（A4=440） */
function hz(semitoneFromA4: number): number {
  return 440 * Math.pow(2, semitoneFromA4 / 12);
}

// E マイナー基調。0 = A4 とした半音オフセット。
const E2 = -29, G2 = -26, A2 = -24, B2 = -22, C3 = -21;
const E3 = -17, A3 = -12, B3 = -10, D4 = -7, E4 = -5, F4S = -3, G4 = -2, B4 = 2;

/** 1小節(8ステップ)ぶんのベース進行 */
const BASS: Record<Exclude<MusicTrack, 'none'>, number[]> = {
  calm:    [E2, 0, B2, 0, G2, 0, B2, 0],
  tension: [E2, E2, 0, G2, 0, E2, A2, 0],
  casino:  [E2, 0, G2, 0, A2, 0, B2, C3],
  combat:  [E2, E2, E2, G2, E2, E2, A2, B2],
  dread:   [E2, 0, 0, 0, C3, 0, 0, 0],
};

/** リードのモチーフ（0 は休符） */
const LEAD: Record<Exclude<MusicTrack, 'none'>, number[]> = {
  calm:    [0, 0, 0, 0, 0, B3, 0, A3],
  tension: [0, 0, E4, 0, D4, 0, 0, B3],
  casino:  [B3, 0, D4, 0, E4, 0, D4, B3],
  combat:  [E4, G4, 0, F4S, E4, 0, B4, 0],
  dread:   [0, 0, 0, 0, 0, 0, E3, 0],
};

const BPM: Record<Exclude<MusicTrack, 'none'>, number> = {
  calm: 78, tension: 96, casino: 88, combat: 132, dread: 60,
};

export class Audio {
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf!: AudioBuffer;

  private track: MusicTrack = 'none';
  private nextStepAt = 0;
  private step = 0;

  masterVolume = 0.6;
  musicVolume = 0.35;
  sfxVolume = 0.8;
  muted = false;

  /** 最初のユーザー操作で呼ぶ。2回目以降は no-op。 */
  unlock(): void {
    if (this.ac) { void this.ac.resume(); return; }
    const AC: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    this.ac = ac;

    this.master = ac.createGain();
    this.master.gain.value = this.masterVolume;
    this.master.connect(ac.destination);

    this.musicBus = ac.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);

    this.sfxBus = ac.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);

    // 2秒ぶんのホワイトノイズを使い回す
    const len = ac.sampleRate * 2;
    this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.nextStepAt = ac.currentTime;
  }

  get enabled(): boolean { return this.ac !== null && !this.muted; }

  toggleMute(): void {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.masterVolume;
  }

  // ── BGM ──────────────────────────────────────────────────────────

  music(track: MusicTrack): void {
    if (this.track === track) return;
    this.track = track;
    this.step = 0;
    if (this.ac) this.nextStepAt = this.ac.currentTime + 0.05;
  }

  /** 毎フレーム呼ぶ。0.2秒先まで先読みスケジュールする。 */
  update(): void {
    const ac = this.ac;
    if (!ac || this.track === 'none' || this.muted) return;
    const t = this.track;
    const stepDur = 60 / BPM[t] / 2; // 8分音符
    const horizon = ac.currentTime + 0.2;

    while (this.nextStepAt < horizon) {
      const at = Math.max(this.nextStepAt, ac.currentTime);
      const i = this.step % 8;

      const b = BASS[t][i]!;
      if (b !== 0) this.osc({ at, freq: hz(b), dur: stepDur * 0.9, gain: 0.5, type: 'triangle' });

      const l = LEAD[t][i]!;
      if (l !== 0) this.osc({ at, freq: hz(l), dur: stepDur * 1.6, gain: 0.16, type: 'sawtooth' }, 1400);

      // ハイハット代わりの微かなノイズ（combat のみ裏拍を強く）
      if (t === 'combat' || (t === 'casino' && i % 2 === 0)) {
        this.noise(at, 0.03, 7000, t === 'combat' && i % 2 === 1 ? 0.05 : 0.025, this.musicBus);
      }

      this.nextStepAt += stepDur;
      this.step++;
    }
  }

  private osc(n: Note, lowpass?: number): void {
    const ac = this.ac!;
    const o = ac.createOscillator();
    o.type = n.type;
    o.frequency.setValueAtTime(n.freq, n.at);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, n.at);
    g.gain.linearRampToValueAtTime(n.gain, n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, n.at + n.dur);
    let node: AudioNode = g;
    o.connect(g);
    if (lowpass) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      g.connect(f);
      node = f;
    }
    node.connect(this.musicBus);
    o.start(n.at);
    o.stop(n.at + n.dur + 0.05);
  }

  // ── SFX ──────────────────────────────────────────────────────────

  private noise(at: number, dur: number, cutoff: number, gain: number, bus: GainNode, type: BiquadFilterType = 'lowpass'): void {
    const ac = this.ac!;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  private blip(at: number, f0: number, f1: number, dur: number, gain: number, type: OscillatorType = 'square'): void {
    const ac = this.ac!;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(this.sfxBus);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  sfx(name: SfxName, pitch = 1): void {
    const ac = this.ac;
    if (!ac || this.muted) return;
    const t = ac.currentTime;
    const p = pitch;

    switch (name) {
      case 'ui.move':     this.blip(t, 620 * p, 620 * p, 0.04, 0.10); break;
      case 'ui.confirm':  this.blip(t, 520 * p, 900 * p, 0.09, 0.14); break;
      case 'ui.cancel':   this.blip(t, 420 * p, 200 * p, 0.09, 0.12); break;
      case 'ui.error':    this.blip(t, 200 * p, 120 * p, 0.20, 0.16, 'sawtooth'); break;
      case 'tick':        this.blip(t, 1400 * p, 1400 * p, 0.02, 0.06); break;

      case 'step':        this.noise(t, 0.06, 900 * p, 0.10, this.sfxBus); break;
      case 'door':        this.noise(t, 0.30, 500, 0.22, this.sfxBus); this.blip(t, 90, 60, 0.28, 0.10, 'triangle'); break;
      case 'pickup':      this.blip(t, 700, 1300, 0.10, 0.14, 'triangle'); break;

      case 'whiff':       this.noise(t, 0.12, 2200 * p, 0.10, this.sfxBus, 'bandpass'); break;
      case 'dodge':       this.noise(t, 0.18, 1400, 0.12, this.sfxBus, 'bandpass'); break;
      case 'punch':       this.noise(t, 0.09, 1100 * p, 0.32, this.sfxBus); this.blip(t, 170, 60, 0.10, 0.22, 'triangle'); break;
      case 'punch.heavy': this.noise(t, 0.16, 800 * p, 0.42, this.sfxBus); this.blip(t, 130, 45, 0.18, 0.30, 'triangle'); break;
      case 'hit':         this.noise(t, 0.12, 1600, 0.26, this.sfxBus, 'bandpass'); break;
      case 'bodyfall':    this.noise(t, 0.35, 380, 0.30, this.sfxBus); this.blip(t, 80, 40, 0.30, 0.18, 'sine'); break;

      case 'gunshot':
        this.noise(t, 0.05, 9000, 0.55, this.sfxBus, 'highpass');
        this.noise(t, 0.28, 700, 0.40, this.sfxBus);
        this.blip(t, 240, 50, 0.14, 0.30, 'square');
        break;
      case 'reload':      this.blip(t, 900, 700, 0.05, 0.14); this.blip(t + 0.12, 640, 480, 0.06, 0.14); break;
      case 'click.empty': this.blip(t, 1500, 900, 0.03, 0.14); break;
      case 'shell':       this.blip(t + 0.15, 2400, 1700, 0.05, 0.07, 'triangle'); break;

      case 'chip':        this.blip(t, 1900 * p, 1500 * p, 0.035, 0.10, 'triangle'); this.noise(t, 0.04, 5000, 0.07, this.sfxBus, 'highpass'); break;
      case 'chips.push':  for (let i = 0; i < 7; i++) this.blip(t + i * 0.035, 1700 + i * 90, 1300, 0.04, 0.07, 'triangle'); break;
      case 'card':        this.noise(t, 0.07, 4200, 0.13, this.sfxBus, 'bandpass'); break;
      case 'card.flip':   this.noise(t, 0.05, 6000, 0.16, this.sfxBus, 'highpass'); break;

      case 'heartbeat':
        this.blip(t, 62, 34, 0.16, 0.42, 'sine');
        this.blip(t + 0.20, 56, 30, 0.22, 0.30, 'sine');
        break;
      case 'shock':
        this.noise(t, 0.10, 3000, 0.45, this.sfxBus, 'bandpass');
        this.blip(t, 1200, 90, 0.22, 0.28, 'sawtooth');
        break;
      case 'glass':
        for (let i = 0; i < 9; i++) this.blip(t + i * 0.018, 3600 - i * 200, 2000, 0.05, 0.08, 'triangle');
        break;
      case 'sting':
        this.osc({ at: t, freq: hz(E3), dur: 1.1, gain: 0.5, type: 'sawtooth' }, 900);
        this.osc({ at: t, freq: hz(E2), dur: 1.4, gain: 0.6, type: 'triangle' });
        break;
    }
  }
}
