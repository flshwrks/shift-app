import { SHIFT_PRESETS, type ShiftType } from './types';

/**
 * 店舗ごとのシフト種別。
 *
 * 店舗が触れるのは「並び順・表示名・時間帯」と、種別そのものの追加／削除。
 * 内部では A〜L の記号を id として使い続ける。
 *
 * ★記号(key)は一度割り当てたら変えない。
 *   `shifts.shift_type` に保存されているのがこの記号なので、並べ替えのたびに
 *   振り直すと**過去のシフトが別の種別を指してしまう**。並び順は配列の順序で
 *   持ち、記号は識別子として固定する。
 *
 * ★記号は `shifts.shift_type` / `shift_requests.shift_type` のCHECK制約と一致させる。
 *   そのため種別は最大12件（A〜L）。さらに増やすには制約と SHIFT_COLORS の拡張が要る。
 *   初期状態は従来どおり A〜G の7件で、H以降は追加したときだけ現れる。
 *
 * 保存先は app_settings の (store_id, 'shift_patterns') に JSON文字列。
 * 提出期間などと同じ「使うときに upsert される」方式で、マイグレーション不要。
 */

/** 種別に使える記号。custom / off は固定の特別扱いなので含まない */
export type PatternKey = Exclude<ShiftType, 'custom' | 'off'>;

// 使える記号は A〜L の12件。DB側の CHECK 制約と一致させること
// （migrations/2026-09-09_shift_type_slots.sql）。
// 12で止めているのはDBの都合ではなく、記号ごとの色を見分けられる上限のため。
export const PATTERN_KEYS: readonly PatternKey[] =
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
export const MAX_PATTERNS = PATTERN_KEYS.length;

/** 初期状態として並べる記号。追加した H 以降は既定値には含めない */
const DEFAULT_KEYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

export interface ShiftPattern {
  /** 記号。一度決めたら変わらない（過去のシフトが参照しているため） */
  key: PatternKey;
  /** 表示名。空なら記号だけを出す */
  label: string;
  start: string;
  end: string;
}

export const SETTINGS_KEY = 'shift_patterns';

/** 追加時の初期値 */
export const NEW_PATTERN_START = '09:00';
export const NEW_PATTERN_END = '18:00';

/** 未設定の店舗に使う既定値（従来の A〜G の7件） */
export const DEFAULT_PATTERNS: ShiftPattern[] = DEFAULT_KEYS.map(key => ({
  key,
  label: '',
  start: SHIFT_PRESETS[key].start,
  end: SHIFT_PRESETS[key].end,
}));

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

function isPatternKey(v: unknown): v is PatternKey {
  return typeof v === 'string' && (PATTERN_KEYS as readonly string[]).includes(v);
}

const cloneDefaults = (): ShiftPattern[] => DEFAULT_PATTERNS.map(p => ({ ...p }));

/**
 * 保存済みJSONを読み戻す。**壊れた値が来ても既定値で動き続けることを優先**する。
 * 設定が読めないだけでシフト入力そのものが止まると、現場が困るため。
 *
 * 2026-09-09 より前の形式（7件すべてを持ち `enabled: false` で無効を表す）も読める。
 * その場合、無効だったものは一覧から取り除く。
 */
export function parsePatterns(raw: string | null | undefined): ShiftPattern[] {
  if (!raw) return cloneDefaults();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return cloneDefaults();
  }
  if (!Array.isArray(parsed)) return cloneDefaults();

  const out: ShiftPattern[] = [];
  const seen = new Set<string>();

  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const src = item as Record<string, unknown>;
    if (!isPatternKey(src.key) || seen.has(src.key)) continue;
    if (src.enabled === false) continue; // 旧形式の「使わない」
    seen.add(src.key);

    // H以降は既定の時間帯を持たないため、追加時と同じ値で補う
    const def = src.key in SHIFT_PRESETS
      ? SHIFT_PRESETS[src.key as keyof typeof SHIFT_PRESETS]
      : { start: NEW_PATTERN_START, end: NEW_PATTERN_END };
    out.push({
      key: src.key,
      label: typeof src.label === 'string' ? src.label.slice(0, 12) : '',
      start: isValidTime(src.start) ? src.start : def.start,
      end: isValidTime(src.end) ? src.end : def.end,
    });
  }

  // 1つも残らないのは異常。既定値に戻して画面が空にならないようにする
  return out.length ? out : cloneDefaults();
}

export function serializePatterns(patterns: ShiftPattern[]): string {
  return JSON.stringify(
    patterns.map(p => ({
      key: p.key,
      label: p.label.trim().slice(0, 12),
      start: p.start,
      end: p.end,
    })),
  );
}

/** まだ使われていない記号のうち、いちばん若いもの。空きが無ければ null */
export function nextAvailableKey(patterns: ShiftPattern[]): PatternKey | null {
  const used = new Set(patterns.map(p => p.key));
  return PATTERN_KEYS.find(k => !used.has(k)) ?? null;
}

/** 末尾に1つ追加する。空きが無ければ何もしない */
export function addPattern(patterns: ShiftPattern[]): ShiftPattern[] {
  const key = nextAvailableKey(patterns);
  if (!key) return patterns;
  return [...patterns, { key, label: '', start: NEW_PATTERN_START, end: NEW_PATTERN_END }];
}

/** 1つ削除する。最後の1つは消せない */
export function removePattern(patterns: ShiftPattern[], key: string): ShiftPattern[] {
  if (patterns.length <= 1) return patterns;
  return patterns.filter(p => p.key !== key);
}

/** 並びを1つ動かす。端を越える指定は何もしない */
export function movePattern(patterns: ShiftPattern[], key: string, dir: -1 | 1): ShiftPattern[] {
  const i = patterns.findIndex(p => p.key === key);
  if (i < 0) return patterns;
  const j = i + dir;
  if (j < 0 || j >= patterns.length) return patterns;
  const next = [...patterns];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * 記号から種別を引く。
 * **削除された記号は null を返す。**過去のシフトがその記号を使っている場合、
 * 呼び出し側はシフト行の start_time / end_time を出すこと（定義ではなく実績を出す）。
 */
export function findPattern(patterns: ShiftPattern[], key: string): ShiftPattern | null {
  return patterns.find(p => p.key === key) ?? null;
}

/** 「A」または「A 早番」の形。凡例やボタンの見出しに使う */
export function patternTitle(p: ShiftPattern): string {
  return p.label.trim() ? `${p.key} ${p.label.trim()}` : p.key;
}

/** 「8:00〜13:00」。先頭の0を落として詰まって見えないようにする */
export function patternTimeRange(p: ShiftPattern): string {
  const trim = (t: string) => t.replace(/^0/, '');
  return `${trim(p.start)}〜${trim(p.end)}`;
}

/**
 * 保存前の検証。
 * 「開始と終了が同じ」は0時間になるので許さない。
 * 日をまたぐ勤務（終了 < 開始）は現状のアプリが想定していないため許さない。
 */
export function validatePatterns(patterns: ShiftPattern[]): string[] {
  const errors: string[] = [];
  if (patterns.length === 0) {
    return ['シフト種別を1つ以上残してください'];
  }
  if (patterns.length > MAX_PATTERNS) {
    errors.push(`シフト種別は最大${MAX_PATTERNS}件です`);
  }
  for (const p of patterns) {
    const name = p.label.trim() ? `${p.key}（${p.label.trim()}）` : p.key;
    if (!isValidTime(p.start) || !isValidTime(p.end)) {
      errors.push(`${name}：時刻の形式が正しくありません`);
      continue;
    }
    if (p.start === p.end) {
      errors.push(`${name}：開始と終了が同じ時刻です`);
    } else if (p.end < p.start) {
      errors.push(`${name}：終了が開始より前になっています（日をまたぐ勤務には未対応です）`);
    }
  }
  return errors;
}
