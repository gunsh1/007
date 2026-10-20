const KEY = 'casino007.save.v1';

/** 章ID。ステージセレクトとチェックポイントの単位。 */
export type ChapterId =
  | 'p00' | 'p01' | 'p02' | 'p03' | 'p04' | 'p05'
  | 'ch00' | 'ch01' | 'ch02' | 'ch03' | 'ch04' | 'ch05'
  | 'ch06' | 'ch07' | 'ch08' | 'ch09' | 'ch10';

export const CHAPTER_ORDER: ChapterId[] = [
  'p00', 'p01', 'p02', 'p03', 'p04', 'p05',
  'ch00', 'ch01', 'ch02', 'ch03', 'ch04', 'ch05', 'ch06', 'ch07', 'ch08', 'ch09', 'ch10',
];

/** 前編（原作 L.1〜L.47）と本編（L.49〜L.111）の境目 */
export const CASINO_START: ChapterId = 'ch00';

export const CHAPTER_TITLES: Record<ChapterId, string> = {
  p00: 'プラハ',
  p01: 'マダガスカル',
  p02: 'Mの自宅',
  p03: 'オーシャン・クラブ',
  p04: '人体の世界展',
  p05: 'マイアミ国際空港',
  ch00: 'ブリーフィング',
  ch01: 'モンテネグロ行き',
  ch02: 'ホテル・スプレンディド',
  ch03: 'カジノ・ロワイヤル 第一夜',
  ch04: '銀の階段',
  ch05: 'フルハウスの罠',
  ch06: 'フィリックス・ライター',
  ch07: 'ヴェスパー・マティーニ',
  ch08: '最終ハンド',
  ch09: '夜道',
  ch10: '地下倉庫',
};

export interface SaveData {
  version: 1;
  /** 到達済みの最終章（ステージセレクトの解放判定） */
  unlocked: ChapterId;
  /** 現在の章とチェックポイントID */
  chapter: ChapterId;
  checkpoint: string;

  /** ボンドのチップ（ドル） */
  chips: number;
  /** ル・シッフルのチップ */
  chiffreChips: number;
  /** フィリックスからの資金提供を受けたか */
  felixBacking: boolean;

  /** ヴェスパーとの信頼度 0..100 */
  vesper: number;
  /** ル・シッフルの癖をどれだけ読めているか 0..100 */
  tellRead: number;
  /** ボンド自身の癖がどれだけ読まれているか 0..100 */
  tellLeak: number;

  /** 登録した暗証番号（原作どおりなら VESPER） */
  pin: string;

  /** 任意の進行フラグ */
  flags: Record<string, boolean>;

  /** 総プレイ秒 */
  playtime: number;
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    unlocked: 'p00',
    chapter: 'p00',
    checkpoint: 'start',
    chips: 10_000_000,
    chiffreChips: 10_000_000,
    felixBacking: false,
    vesper: 20,
    tellRead: 0,
    tellLeak: 0,
    pin: '',
    flags: {},
    playtime: 0,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1) return defaultSave();
    // 欠けたフィールドは既定値で埋める（開発中にフィールドが増えても壊れないように）
    return { ...defaultSave(), ...parsed, flags: { ...parsed.flags } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // プライベートモード等。セーブできなくてもゲームは続行する。
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

/** 章の解放。既に先へ進んでいる場合は巻き戻さない。 */
export function unlockChapter(save: SaveData, ch: ChapterId): void {
  if (CHAPTER_ORDER.indexOf(ch) > CHAPTER_ORDER.indexOf(save.unlocked)) save.unlocked = ch;
}

/** $12,345,678 形式 */
export function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

/** $12.5M 形式。席のラベルなど幅が取れない場所用。 */
export function moneyShort(n: number): string {
  const v = Math.round(n);
  if (v >= 1_000_000) {
    const m = v / 1_000_000;
    return '$' + (m >= 100 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, '')) + 'M';
  }
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(0) + 'K';
  return '$' + v;
}
