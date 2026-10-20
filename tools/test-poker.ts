/**
 * ポーカーコアのヘッドレス検証。ブラウザを開かずに正しさを担保する。
 *   npm run test:poker
 *
 * 1. evaluate() を総当たり実装と突き合わせる
 * 2. 既知のハンドの大小関係
 * 3. 7枚役の出現頻度が理論値に収束するか
 * 4. ベッティングの不変条件（チップ保存・サイドポット合計・進行の停止性）
 * 5. arrange()（検証用の仕込み）が指定どおりに配られるか
 * 6. 原作の局面が評価器で正しく順位づけされるか
 * 7. 癖の発火率と、「読み」への反応
 * 8. 章のセッションが有限ハンドで決着すること
 */
import { Rng } from '../src/core/rng';
import { FULL_DECK, parseCards, cardsStr, type Card } from '../src/poker/cards';
import { Cat, categoryOf, evaluate, evaluateBruteForce, handName, handRankNumber, bestFive } from '../src/poker/evaluator';
import { Deck } from '../src/poker/deck';
import { HandEngine, makeSeats, type Action } from '../src/poker/betting';
import { decide, LE_CHIFFRE, TABLE_PROFILES } from '../src/poker/opponents';
import { Tells, TELL_PRESETS } from '../src/poker/tells';

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string, detail = ''): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function section(name: string): void {
  console.log(`\n── ${name}`);
}

function eq(a: number, b: number, tol: number, label: string): void {
  ok(Math.abs(a - b) <= tol, label, `got ${a.toFixed(6)}, want ${b.toFixed(6)} (±${tol.toFixed(6)})`);
}

// ── 1. evaluate vs 総当たり ─────────────────────────────────────
section('evaluate() を総当たりと突き合わせ');
{
  const rng = new Rng(0xa11_0f_07);
  const N = 20_000;
  let mismatch = 0;
  let firstBad = '';
  for (let i = 0; i < N; i++) {
    const pool = rng.shuffle([...FULL_DECK]);
    const hand = pool.slice(0, 7);
    const fast = evaluate(hand);
    const slow = evaluateBruteForce(hand);
    if (fast !== slow) {
      mismatch++;
      if (!firstBad) firstBad = `${cardsStr(hand)} fast=${fast}(${handName(fast)}) slow=${slow}(${handName(slow)})`;
    }
  }
  ok(mismatch === 0, `7枚 ${N} ハンドで総当たりと一致`, firstBad);

  // 6枚でも一致すること
  let mismatch6 = 0;
  for (let i = 0; i < 5_000; i++) {
    const pool = rng.shuffle([...FULL_DECK]);
    const hand = pool.slice(0, 6);
    if (evaluate(hand) !== evaluateBruteForce(hand)) mismatch6++;
  }
  ok(mismatch6 === 0, '6枚 5,000 ハンドで総当たりと一致');
}

// ── 2. 既知のハンドの大小 ────────────────────────────────────────
section('既知のハンドの大小関係');
{
  const h = (s: string): number => evaluate(parseCards(s));

  ok(categoryOf(h('AsKsQsJsTs')) === Cat.StraightFlush, 'ロイヤル = ストレートフラッシュ');
  ok(handName(h('AsKsQsJsTs')) === 'ロイヤルストレートフラッシュ', 'ロイヤルの名称');
  ok(categoryOf(h('As5s4s3s2s')) === Cat.StraightFlush, 'スチールホイールもストレートフラッシュ');
  ok(h('AsKsQsJsTs') > h('As5s4s3s2s'), 'ロイヤル > ホイールSF');

  ok(categoryOf(h('Ac5d4s3h2c')) === Cat.Straight, 'A2345 はストレート');
  ok(h('6c5d4s3h2c') > h('Ac5d4s3h2c'), '6ハイストレート > 5ハイストレート');
  ok(h('AcKdQsJhTc') > h('Kc Qd Js Th 9c'), 'ブロードウェイ > Kハイストレート');

  ok(categoryOf(h('7c7d7s7h2c')) === Cat.Quads, 'フォーカード');
  ok(categoryOf(h('7c7d7s2h2c')) === Cat.FullHouse, 'フルハウス');
  ok(h('7c7d7s7h2c') > h('AcAdAsKhKc'), 'フォーカード > フルハウス');
  ok(h('AcAdAsKhKc') > h('AsKsQs9s2s'), 'フルハウス > フラッシュ');
  ok(h('AsKsQs9s2s') > h('AcKdQsJhTc'), 'フラッシュ > ストレート');
  ok(h('AcKdQsJhTc') > h('7c7d7s2h3c'), 'ストレート > スリーカード');
  ok(h('7c7d7s2h3c') > h('AcAdKsKh2c'), 'スリーカード > ツーペア');
  ok(h('AcAdKsKh2c') > h('AcAd8s5h2c'), 'ツーペア > ワンペア');
  ok(h('AcAd8s5h2c') > h('AcKd8s5h2c'), 'ワンペア > ハイカード');

  // キッカー
  ok(h('AcAdKsQh9c') > h('AcAdKsQh8c'), 'ワンペアのキッカー比較');
  ok(h('AcAdKsKhQc') > h('AcAdKsKhJc'), 'ツーペアのキッカー比較');
  ok(evaluate(parseCards('AcAdKsQh9c')) === evaluate(parseCards('AhAsKcQd9d')), 'スート違いは同値');

  // 7枚でボードのみが役になる（全員同じ役）
  const board = parseCards('AsKsQsJsTs');
  ok(evaluate([...parseCards('2c3d'), ...board]) === evaluate([...parseCards('4h5h'), ...board]), 'ボードで引き分け');

  // 原作準拠の役番号
  ok(handRankNumber(h('7c7d7s7h2c')) === 2, 'フォーカードは2番目に強い');
  ok(handRankNumber(h('AcAdAsKhKc')) === 3, 'フルハウスは3番目に強い');
  ok(handRankNumber(h('AcKd8s5h2c')) === 9, 'ハイカードは9番目');

  // bestFive
  const seven = parseCards('AsKsQsJsTs2c3d');
  ok(evaluate(bestFive(seven)) === evaluate(seven), 'bestFive のスコアが一致');
  ok(bestFive(seven).length === 5, 'bestFive は5枚');
}

// ── 3. 出現頻度 ───────────────────────────────────────────────
section('7枚役の出現頻度（理論値との比較）');
{
  const TOTAL = 133_784_560;
  const EXPECTED: [Cat, number, string][] = [
    [Cat.StraightFlush, 41_584 / TOTAL, 'ストレートフラッシュ'],
    [Cat.Quads, 224_848 / TOTAL, 'フォーカード'],
    [Cat.FullHouse, 3_473_184 / TOTAL, 'フルハウス'],
    [Cat.Flush, 4_047_644 / TOTAL, 'フラッシュ'],
    [Cat.Straight, 6_180_020 / TOTAL, 'ストレート'],
    [Cat.Trips, 6_461_620 / TOTAL, 'スリーカード'],
    [Cat.TwoPair, 31_433_400 / TOTAL, 'ツーペア'],
    [Cat.Pair, 58_627_800 / TOTAL, 'ワンペア'],
    [Cat.HighCard, 23_294_460 / TOTAL, 'ハイカード'],
  ];

  const N = 1_000_000;
  const rng = new Rng(0x0007_ca51);
  const counts = new Array<number>(9).fill(0);
  const pool = [...FULL_DECK];
  const hand: Card[] = new Array<Card>(7);

  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 7; k++) {
      const j = k + rng.int(52 - k);
      const t = pool[k]!; pool[k] = pool[j]!; pool[j] = t;
      hand[k] = pool[k]!;
    }
    counts[categoryOf(evaluate(hand))]!++;
  }
  const ms = Date.now() - t0;

  for (const [cat, p, label] of EXPECTED) {
    const got = counts[cat]! / N;
    const sigma = Math.sqrt((p * (1 - p)) / N);
    const tol = Math.max(4 * sigma, 0.00004);
    eq(got, p, tol, `${label} の頻度`);
  }
  console.log(`  ${N.toLocaleString()} ハンドを ${ms}ms で評価 (${Math.round(N / (ms / 1000)).toLocaleString()} hands/s)`);
}

// ── 4. ベッティングの不変条件 ────────────────────────────────────
section('ベッティングエンジンの不変条件');
{
  const rng = new Rng(0xbe11_a90d);
  const HANDS = 4_000;
  let handsPlayed = 0;
  let showdowns = 0;
  let allInHands = 0;

  const randomAction = (e: HandEngine): Action => {
    const lg = e.legal();
    const r = rng.next();
    if (lg.check && r < 0.45) return { kind: 'check' };
    if (lg.raise && r < 0.25) {
      const span = lg.maxRaiseTo - lg.minRaiseTo;
      const to = lg.minRaiseTo + (span > 0 ? rng.int(span + 1) : 0);
      return { kind: 'raise', to };
    }
    if (lg.raise && r < 0.32) return { kind: 'allin' };
    if (lg.call && r < 0.80) return { kind: 'call' };
    if (lg.check) return { kind: 'check' };
    return { kind: 'fold' };
  };

  for (let h = 0; h < HANDS; h++) {
    const n = 2 + rng.int(9); // 2〜10人
    const seats = makeSeats(
      Array.from({ length: n }, (_, i) => ({
        id: i,
        name: `P${i}`,
        chips: 1000 + rng.int(40) * 250,
        hero: i === 0,
      })),
    );
    const before = seats.reduce((a, s) => a + s.chips, 0);
    const deck = new Deck(new Rng(rng.int(0x7fffffff)));
    const e = new HandEngine(seats, { button: rng.int(n), smallBlind: 25, bigBlind: 50 }, deck);
    e.begin();

    let guard = 0;
    while (!e.isComplete) {
      if (++guard > 2000) { ok(false, 'ハンドが停止する', `無限ループ (hand ${h})`); break; }
      ok(e.actor >= 0, 'アクション待ちには手番がある');
      if (e.actor < 0) break;
      e.act(randomAction(e));
    }
    handsPlayed++;

    const after = seats.reduce((a, s) => a + s.chips, 0);
    if (before !== after) ok(false, 'チップ総量が保存される', `hand ${h}: ${before} → ${after}`);

    const committed = seats.reduce((a, s) => a + s.committed, 0);
    const potSum = e.buildPots().reduce((a, p) => a + p.amount, 0);
    if (committed !== potSum) ok(false, 'サイドポット合計 = 拠出合計', `hand ${h}: ${potSum} vs ${committed}`);

    const paid = Object.values(e.result?.payouts ?? {}).reduce((a, v) => a + v, 0);
    if (paid !== committed) ok(false, '配当合計 = 拠出合計', `hand ${h}: ${paid} vs ${committed}`);

    for (const s of seats) {
      if (s.chips < 0) ok(false, 'スタックが負にならない', `hand ${h} ${s.name}`);
      if (s.bet !== 0) ok(false, 'ハンド終了時のラウンドベットは0', `hand ${h} ${s.name}`);
    }

    if (e.result && !e.result.walkover) showdowns++;
    if (seats.some((s) => s.allIn)) allInHands++;
  }

  ok(handsPlayed === HANDS, `${HANDS} ハンドを完走`);
  ok(showdowns > HANDS * 0.1, 'ショーダウンが十分な回数起きる', `${showdowns}/${HANDS}`);
  ok(allInHands > 0, 'オールインが発生する', `${allInHands}/${HANDS}`);
  console.log(`  ${handsPlayed} ハンド / ショーダウン ${showdowns} / オールイン発生 ${allInHands}`);
}

// ── 5. 仕込みデッキ ────────────────────────────────────────────
section('仕込みデッキ（arrange）');
{
  const deck = new Deck(new Rng(1234));
  const holes = { 0: parseCards('AsAd'), 4: parseCards('7c7h') };
  const board = parseCards('As2d3c'); // わざと重複させて弾かれることを確認
  let threw = false;
  try { deck.arrange(10, { holes, board }); } catch { threw = true; }
  ok(threw, '重複するカードの仕込みは弾かれる');

  const d2 = new Deck(new Rng(1234));
  d2.arrange(10, { holes: { 0: parseCards('AsAd'), 4: parseCards('7c7h') }, board: parseCards('Ks7s2d4h9c') });
  const dealt: Card[][] = [];
  for (let i = 0; i < 10; i++) dealt.push(d2.dealMany(2));
  const b = d2.dealMany(5);
  ok(cardsStr(dealt[0]!) === 'As Ad', '席0のホールカードが仕込みどおり', cardsStr(dealt[0]!));
  ok(cardsStr(dealt[4]!) === '7c 7h', '席4のホールカードが仕込みどおり', cardsStr(dealt[4]!));
  ok(cardsStr(b) === 'Ks 7s 2d 4h 9c', 'ボードが仕込みどおり', cardsStr(b));

  const all = [...dealt.flat(), ...b];
  ok(new Set(all).size === all.length, '配られたカードに重複がない');
  ok(d2.remaining === 52 - 25, '残り枚数が正しい', `${d2.remaining}`);
}

// ── 6. 原作の局面 ──────────────────────────────────────────────
section('原作の局面：フルハウス vs フォーカード（第5章）');
{
  // ボンドはフルハウス、ル・シッフルはフォーカード（原作 L.83-85）
  const board = parseCards('Ah8s8d4c');
  const bond = [...parseCards('AsAc'), ...board, ...parseCards('2h')];
  const chiffre = [...parseCards('8c8h'), ...board, ...parseCards('2h')];
  const sb = evaluate(bond);
  const sc = evaluate(chiffre);
  ok(handName(sb) === 'フルハウス', 'ボンドはフルハウス', handName(sb));
  ok(handName(sc) === 'フォーカード', 'ル・シッフルはフォーカード', handName(sc));
  ok(sc > sb, 'フォーカードがフルハウスに勝つ');
  ok(handRankNumber(sb) === 3 && handRankNumber(sc) === 2, '原作どおりの役番号（3番目 / 2番目）');
}

// ── 7. AI が破綻せず打てるか ─────────────────────────────────────
section('AI の意思決定');
{
  const rng = new Rng(0x0bad_c0de);
  const profiles = [LE_CHIFFRE, ...TABLE_PROFILES];
  let hands = 0;
  let folds = 0, calls = 0, raises = 0, checks = 0;
  const t0 = Date.now();

  for (let h = 0; h < 120; h++) {
    const n = 6;
    const seats = makeSeats(Array.from({ length: n }, (_, i) => ({ id: i, name: profiles[i % profiles.length]!.name, chips: 20_000 })));
    const deck = new Deck(new Rng(rng.int(0x7fffffff)));
    const e = new HandEngine(seats, { button: h % n, smallBlind: 100, bigBlind: 200 }, deck);
    e.begin();
    let guard = 0;
    while (!e.isComplete && guard++ < 500) {
      const p = profiles[e.actor % profiles.length]!;
      const d = decide(e, e.actor, p, rng, 0);
      ok(d.equity >= 0 && d.equity <= 1, 'エクイティが 0..1');
      switch (d.action.kind) {
        case 'fold': folds++; break;
        case 'call': calls++; break;
        case 'check': checks++; break;
        default: raises++; break;
      }
      e.act(d.action);
    }
    ok(e.isComplete, 'AI だけでハンドが終わる', `hand ${h}`);
    const total = seats.reduce((a, s) => a + s.chips, 0);
    ok(total === n * 20_000, 'AI 対局でもチップが保存される', `${total}`);
    hands++;
  }
  const ms = Date.now() - t0;
  ok(folds > 0 && calls > 0 && raises > 0, 'AI がフォールド・コール・レイズを使い分ける', `F${folds} C${calls} R${raises} X${checks}`);
  console.log(`  ${hands} ハンド / ${ms}ms / F${folds} C${calls} R${raises} X${checks}`);
}

// ── 8. 癖の発火 ────────────────────────────────────────────────
section('癖（TELL）の発火率');
{
  const rng = new Rng(0x7e11_5eed);
  const seatDefs = Array.from({ length: 10 }, (_, i) => ({
    id: i, name: i === 5 ? 'ル・シッフル' : `P${i}`, chips: 10_000_000, hero: i === 0,
  }));
  const profiles = [LE_CHIFFRE, ...TABLE_PROFILES];

  for (const [label, cfg] of Object.entries(TELL_PRESETS)) {
    const tells = new Tells(cfg);
    let chiffreDecisions = 0, chiffreAggro = 0, genuine = 0, fake = 0, hands = 0;

    for (let h = 0; h < 200; h++) {
      const seats = makeSeats(seatDefs.map((d) => ({ ...d, chips: 10_000_000 })));
      const deck = new Deck(new Rng(rng.int(0x7fffffff)));
      const e = new HandEngine(seats, { button: h % 10, smallBlind: 100_000, bigBlind: 200_000 }, deck);
      e.begin();
      let guard = 0;
      while (!e.isComplete && guard++ < 400) {
        const i = e.actor;
        if (i === 0) { e.act({ kind: 'fold' }); continue; } // ボンドは降りる
        const p = i === 5 ? LE_CHIFFRE : profiles[(i % (profiles.length - 1)) + 1]!;
        const d = decide(e, i, p, rng, 0);
        if (i === 5) {
          chiffreDecisions++;
          if (d.action.kind === 'raise' || d.action.kind === 'allin') chiffreAggro++;
          const k = tells.begin(d, rng);
          if (k === 'genuine') genuine++;
          if (k === 'fake') fake++;
        }
        e.act(d.action);
      }
      hands++;
    }

    const perHand = (genuine + fake) / hands;
    console.log(
      `  ${label}: ${hands}ハンド / ル・シッフルの判断 ${chiffreDecisions} (攻撃 ${chiffreAggro}) ` +
      `/ 本物 ${genuine} 偽 ${fake} → 1ハンドあたり ${perHand.toFixed(2)} 回`,
    );
    ok(chiffreAggro > 0, `${label}: ル・シッフルがレイズを打つ`);
    ok(perHand >= 0.08, `${label}: 癖が1ハンドに0.08回以上は出る`, perHand.toFixed(3));
  }
}

// ── 9. 原作の最終局面（評価器の答え合わせ） ──────────────────────
// 実際のゲームではこの札は仕込まない（配りは完全ランダム）。
// 原作 L.99 の四つ巴が評価器で正しく順位づけされるかだけを確かめる。
section('原作の最終局面（四つ巴）');
{
  const board = parseCards('4sAs6s8sAh');
  const hands: [string, string, string][] = [
    ['ボンド', '5s7s', 'ストレートフラッシュ'],
    ['インファンテ', '8h8d', 'フルハウス'],
    ['フクトゥ', 'KsQs', 'フラッシュ'],
    ['ル・シッフル', 'Ac6h', 'フルハウス'],
  ];
  const scores = hands.map(([who, hole, want]) => {
    const s = evaluate([...parseCards(hole), ...board]);
    ok(handName(s) === want, `${who} は ${want}`, handName(s));
    return { who, s };
  });

  const bond = scores[0]!.s;
  ok(scores.every((x) => x.who === 'ボンド' || bond > x.s), 'ボンドが全員に勝つ');
  // 順位：ボンド(SF) > ル・シッフル(エースのフル) > インファンテ(8のフル) > フクトゥ(フラッシュ)
  ok(scores[3]!.s > scores[1]!.s, 'エースのフルハウス > 8のフルハウス');
  ok(scores[1]!.s > scores[2]!.s, '8のフルハウス > フラッシュ');
  ok(handRankNumber(bond) === 1, 'ボンドの役は1番目に強い');

  // カードに重複がないこと（Deck.arrange が弾かないことを事前に確認）
  const all = [...board, ...hands.flatMap(([, h]) => parseCards(h))];
  ok(new Set(all).size === all.length, '仕込みカードに重複がない');
}

// ── 10. 癖が「読み」に反応するか ────────────────────────────────
// 読まれていると察したル・シッフルは、本物を抑えて偽物を増やす。
section('癖と「読み」の関係');
{
  const cfg = TELL_PRESETS.ch05;
  const rng = new Rng(0x1ead_5eed);
  const count = (read: number): { genuine: number; fake: number } => {
    const t = new Tells(cfg);
    let genuine = 0, fake = 0;
    for (let i = 0; i < 4000; i++) {
      // ブラフとバリューを半々で投げる
      const bluff = i % 2 === 0;
      const k = t.begin(
        { action: { kind: 'raise', to: 1 }, equity: bluff ? 0.25 : 0.78, bluff },
        rng, read,
      );
      if (k === 'genuine') genuine++;
      if (k === 'fake') fake++;
    }
    return { genuine, fake };
  };

  const low = count(0);
  const high = count(100);
  console.log(`  読み0   → 本物 ${low.genuine} / 偽 ${low.fake}`);
  console.log(`  読み100 → 本物 ${high.genuine} / 偽 ${high.fake}`);
  ok(high.fake > low.fake * 1.4, '読みが上がると偽の癖が増える', `${low.fake} → ${high.fake}`);
  ok(high.genuine < low.genuine, '読みが上がると本物の癖は減る', `${low.genuine} → ${high.genuine}`);
  ok(low.fake > 0 && high.genuine > 0, 'どちらの状況でも両方の癖が出うる');

  // 攻撃していない時は癖が出ない
  const t = new Tells(cfg);
  ok(t.begin({ action: { kind: 'call' }, equity: 0.9, bluff: false }, rng, 100) === 'none', 'コールでは癖が出ない');
  ok(t.begin({ action: { kind: 'fold' }, equity: 0.1, bluff: true }, rng, 0) === 'none', 'フォールドでは癖が出ない');
}

// ── 11. セッションが必ず終わる（完全ランダム＋ブラインド上昇） ────
// 配り札を仕込まなくなったので、「第5章でボンドが必ず飛ぶ」ことは
// ブラインドの上昇が保証している。実際に終わるかを回して確かめる。
section('セッションの停止性');
{
  interface SimCfg {
    label: string;
    hero: number; chiffre: number; guests: number;
    sb: number; bb: number;
    everyHands: number; factor: number;
    handsPerSitting: number; maxSittings: number;
    /** ボンドの打ち方 */
    heroPlay: 'fold' | 'ai';
    /** 終了条件 */
    until: 'heroBust' | 'either';
  }

  const sim = (c: SimCfg, seed: number): { hands: number; ended: string } => {
    const rng = new Rng(seed);
    let heroChips = c.hero;
    let chiffreChips = c.chiffre;
    const guests = Array.from({ length: 8 }, () => c.guests);
    let sb = c.sb, bb = c.bb;
    let total = 0;
    let button = rng.int(10);

    for (let sitting = 0; sitting < c.maxSittings; sitting++) {
      for (let h = 0; h < c.handsPerSitting; h++) {
        if (h > 0 && h % c.everyHands === 0) { sb = Math.round(sb * c.factor); bb = Math.round(bb * c.factor); }
        const chips = [heroChips, guests[0]!, guests[1]!, guests[2]!, guests[3]!, chiffreChips,
          guests[4]!, guests[5]!, guests[6]!, guests[7]!];
        const seats = makeSeats(chips.map((v, i) => ({
          id: i, name: `S${i}`, chips: Math.max(0, v), hero: i === 0,
        })));
        for (const s of seats) if (s.chips <= 0) s.out = true;
        const live = seats.filter((s) => !s.out).length;
        if (live < 2) return { hands: total, ended: heroChips <= 0 ? 'heroBust' : 'chiffreBust' };

        button = (button + 1) % 10;
        const deck = new Deck(new Rng(rng.int(0x7fffffff)));
        const e = new HandEngine(seats, { button, smallBlind: sb, bigBlind: bb }, deck);
        e.begin();
        let guard = 0;
        while (!e.isComplete && guard++ < 600) {
          const i = e.actor;
          if (i < 0) break;
          if (i === 0 && c.heroPlay === 'fold') {
            const lg = e.legal();
            e.act(lg.check ? { kind: 'check' } : { kind: 'fold' });
            continue;
          }
          const p = i === 5 ? LE_CHIFFRE : TABLE_PROFILES[(i + 7) % TABLE_PROFILES.length]!;
          e.act(decide(e, i, p, rng, 0).action);
        }
        total++;

        heroChips = seats[0]!.chips;
        chiffreChips = seats[5]!.chips;
        const gi = [1, 2, 3, 4, 6, 7, 8, 9];
        gi.forEach((s, k) => { guests[k] = seats[s]!.chips; });

        if (heroChips <= 0) return { hands: total, ended: 'heroBust' };
        if (c.until === 'either' && chiffreChips <= 0) return { hands: total, ended: 'chiffreBust' };
        if (chiffreChips <= 0) chiffreChips = 60_000_000; // 第5章：彼は積み直す
      }
    }
    return { hands: total, ended: 'capped' };
  };

  // ボンドが降り続けても、ブラインドに焼かれて飛ぶ（原作の敗北が成立する）
  const ch05Fold: SimCfg = {
    label: '第5章（降り続ける）',
    hero: 30_000_000, chiffre: 45_000_000, guests: 8_000_000,
    sb: 250_000, bb: 500_000, everyHands: 2, factor: 2,
    handsPerSitting: 8, maxSittings: 4, heroPlay: 'fold', until: 'heroBust',
  };
  const ch05Play: SimCfg = { ...ch05Fold, label: '第5章（打つ）', heroPlay: 'ai' };
  const ch08: SimCfg = {
    label: '第8章',
    hero: 70_000_000, chiffre: 55_000_000, guests: 5_000_000,
    sb: 500_000, bb: 1_000_000, everyHands: 3, factor: 1.6,
    handsPerSitting: 24, maxSittings: 3, heroPlay: 'ai', until: 'either',
  };

  for (const cfg of [ch05Fold, ch05Play, ch08]) {
    const runs = 40;
    let capped = 0;
    let sum = 0;
    let worst = 0;
    for (let i = 0; i < runs; i++) {
      const r = sim(cfg, 0xc0ffee + i * 7919);
      sum += r.hands;
      worst = Math.max(worst, r.hands);
      if (r.ended === 'capped') capped++;
    }
    const cap = cfg.handsPerSitting * cfg.maxSittings;
    console.log(
      `  ${cfg.label}: ${runs}回 / 平均 ${(sum / runs).toFixed(1)} ハンドで決着 ` +
      `/ 最長 ${worst} / 上限(${cap})まで未決着 ${capped}`,
    );
    // 上限に達した場合は章側が畳むので進行は止まらない。ただし稀であること。
    ok(capped <= runs * 0.2, `${cfg.label}: 8割以上が自然に決着する`, `未決着 ${capped}/${runs}`);
    ok(sum / runs < cap * 0.8, `${cfg.label}: 平均が上限より十分短い`, `${(sum / runs).toFixed(1)} / ${cap}`);
  }
}

// ── 結果 ──────────────────────────────────────────────────────
console.log('');
if (failures === 0) {
  console.log(`✔ すべて通過 (${checks} 件のチェック)`);
  process.exit(0);
} else {
  console.error(`✗ ${failures} 件失敗 / ${checks} 件中`);
  process.exit(1);
}
