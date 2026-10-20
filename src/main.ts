import { Display } from './core/display';
import { Input, DEBUG_KEY } from './core/input';
import { Audio } from './core/audio';
import { Loop } from './core/loop';
import { SceneStack, type SceneCtx } from './core/scene';
import { loadSave, writeSave } from './core/save';
import { TitleScene } from './scenes/title';
import { DebugMenu } from './scenes/debug-menu';
import { PauseScene } from './scenes/pause';
import './stages/index';

const display = new Display();
const input = new Input();
input.attachMouse(display.surface, (x, y) => display.toGame(x, y));
const audio = new Audio();
const scenes = new SceneStack();

const ctx: SceneCtx = {
  display,
  input,
  audio,
  scenes,
  save: loadSave(),
  time: 0,
  debug: { invincible: false, showHitboxes: false, freeCamera: false, skipPoker: false },
};
scenes.bind(ctx);
scenes.push(new TitleScene());

// 自動再生ポリシー対策：最初のキー入力／クリックで AudioContext を起こす
const unlock = (): void => {
  audio.unlock();
  window.removeEventListener('keydown', unlock);
  window.removeEventListener('pointerdown', unlock);
};
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);

/** ここではポーズを開かない（タイトル・ED・すでに開いているメニュー類） */
const NO_PAUSE = new Set(['title', 'pause', 'debug', 'ending', 'death', 'qte', 'pin']);

let autosaveAcc = 0;

const loop = new Loop(
  (dt) => {
    ctx.time = loop.time;
    ctx.save.playtime += dt;

    if (input.rawJustPressed(DEBUG_KEY) && scenes.current?.name !== 'debug') {
      scenes.push(new DebugMenu());
    }

    const top = scenes.current?.name;
    if (input.justPressed('menu') && top && !NO_PAUSE.has(top)) {
      scenes.push(new PauseScene());
    }

    scenes.update(dt);
    audio.update();
    input.endFrame();

    autosaveAcc += dt;
    if (autosaveAcc > 20) { autosaveAcc = 0; writeSave(ctx.save); }
  },
  (alpha) => {
    display.begin();
    scenes.render(alpha);
  },
);

document.getElementById('boot')?.remove();
loop.start();

window.addEventListener('beforeunload', () => writeSave(ctx.save));

// 開発中にコンソールから触れるように
(window as unknown as { G: unknown }).G = { ctx, scenes, loop, audio, display };
