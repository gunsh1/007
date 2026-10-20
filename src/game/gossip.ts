/**
 * 聞き込み。NPC に「何を訊くか」を選ばせ、訊いた内容だけが手札になる。
 *
 * 得た情報は save.flags['intel:<id>'] に残り、後の章でヒントとして顔を出す。
 * 難易度そのものは変えない — 知っていれば迷わない、という差だけをつける。
 * 訊ける回数に制限はないが、同じ話題は一度きり。
 */
import type { SceneCtx } from '../core/scene';
import type { LookName } from '../gfx/actors';
import { say, type Beat } from './dialogue';

export interface Topic {
  /** save.flags['intel:<id>'] のキー */
  id: string;
  /** 選択肢に出す「訊く言葉」 */
  ask: string;
  /** 返ってくる話 */
  reply: Beat[];
  /** この話題が出る条件 */
  when?: (ctx: SceneCtx) => boolean;
}

export const INTEL_PREFIX = 'intel:';

export function hasIntel(ctx: SceneCtx, id: string): boolean {
  return ctx.save.flags[INTEL_PREFIX + id] === true;
}

export function grantIntel(ctx: SceneCtx, id: string): void {
  ctx.save.flags[INTEL_PREFIX + id] = true;
}

/**
 * 聞き込みを開始する。話題が尽きるか「切り上げる」を選ぶまで繰り返す。
 * intro は最初の一度だけ流れる。
 */
export function askAround(
  ctx: SceneCtx,
  opts: {
    who: string;
    portrait?: LookName;
    topics: Topic[];
    intro?: Beat[];
    /** 話題が尽きた時 */
    exhausted?: Beat[];
    onDone?: (ctx: SceneCtx) => void;
  },
): void {
  const step = (c: SceneCtx, first: boolean): void => {
    const left = opts.topics.filter(
      (t) => !hasIntel(c, t.id) && (!t.when || t.when(c)),
    );

    if (left.length === 0) {
      say(c, opts.exhausted ?? [
        { kind: 'line', who: opts.who, text: '……話せることは、もう全部話した。', portrait: opts.portrait },
      ], (_r, cc) => opts.onDone?.(cc));
      return;
    }

    const options = left.slice(0, 3).map((t) => ({ id: t.id, label: t.ask }));
    options.push({ id: '__leave', label: '話を切り上げる' });

    const script: Beat[] = [
      ...(first ? opts.intro ?? [] : []),
      { kind: 'choice', prompt: `${opts.who}に何を訊く？`, options },
    ];

    say(c, script, (r, cc) => {
      const pick = r['last'];
      if (!pick || pick === '__leave') { opts.onDone?.(cc); return; }
      const topic = left.find((t) => t.id === pick);
      if (!topic) { opts.onDone?.(cc); return; }
      grantIntel(cc, topic.id);
      say(cc, topic.reply, (_r2, c2) => step(c2, false));
    });
  };

  step(ctx, true);
}
