import { SHIFT_PRESETS, type ShiftType } from './types';

/**
 * 店舗ごとのシフトパターン。
 *
 * A〜G は「枠」として固定し、その中身（表示名・時間帯・使うかどうか）を
 * 店舗ごとに差し替える方式にしている。理由:
 *
 *  - `shifts.shift_type` のCHECK制約（'A'..'G','custom','off'）を変えずに済む。
 *    制約を動的にできない以上、枠を固定するほうが安全
 *  - **過去のシフトが書き換わらない。** シフト行は start_time / end_time を
 *    自分で持っているので、パターン定義を変えても既に入力済みのシフトの
 *    時刻は動かない（変わるのは、以後の入力時の既定値と、一覧の凡例表示）
 *  - 未設定の店舗は既定値で動くため、移行作業が要らない
 *
 * 保存先は app_settings の (store_id, 'shift_patterns') に JSON文字列。
 * 提出期間などと同じ「使うときに upsert される」方式で、マイグレーション不要。
 *
 * 枠の上限は7（A〜G）。増やすには shifts のCHECK制約と SHIFT_COLORS の
 * 追加が要るため、必要になった時点で別途対応する。
 */

/** パターンを持てる枠。custom / off は固定の特別扱いなので含まない */
export type PatternKey = Exclude<ShiftType, 'custom' | 'off'>;

export const PATTERN_KEYS: readonly PatternKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

export interface ShiftPattern {
  key: PatternKey;
  /** 表示名。空なら枠の記号（A/B/…）をそのまま使う */
  label: string;
  start: string;
  end: string;
  /** false の枠は入力時の選択肢に出さない。過去のシフトの表示には引き続き使う */
  enabled: boolean;
}

export const SETTINGS_KEY = 'shift_patterns';

/** 未設定の店舗に使う既定値（従来の A〜G と同じ） */
export const DEFAULT_PATTERNS: ShiftPattern[] = PATTERN_KEYS.map(key => ({
  key,
  label: '',
  start: SHIFT_PRESETS[key].start,
  end: SHIFT_PRESETS[key].end,
  enabled: true,
}));

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

/**
 * 保存済みJSONを読み戻す。**壊れた値が来ても既定値で動き続けることを優先**する。
 * 設定が読めないだけでシフト入力そのものが止まると、現場が困るため。
 * 欠けている枠・不正な時刻は、その枠だけ既定値で補う。
 */
export function parsePatterns(raw: string | null | undefined): ShiftPattern[] {
  if (!raw) return DEFAULT_PATTERNS.map(p => ({ ...p }));

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PATTERNS.map(p => ({ ...p }));
  }
  if (!Array.isArray(parsed)) return DEFAULT_PATTERNS.map(p => ({ ...p }));

  const byKey = new Map<string, Record<string, unknown>>();
  for (const item of parsed) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const k = (item as Record<string, unknown>).key;
      if (typeof k === 'string') byKey.set(k, item as Record<string, unknown>);
    }
  }

  return PATTERN_KEYS.map(key => {
    const src = byKey.get(key);
    const def = SHIFT_PRESETS[key];
    if (!src) return { key, label: '', start: def.start, end: def.end, enabled: true };
    return {
      key,
      label: typeof src.label === 'string' ? src.label.slice(0, 12) : '',
      start: isValidTime(src.start) ? src.start : def.start,
      end: isValidTime(src.end) ? src.end : def.end,
      // 明示的に false のときだけ無効。未指定は有効扱い（後方互換）
      enabled: src.enabled !== false,
    };
  });
}

export function serializePatterns(patterns: ShiftPattern[]): string {
  return JSON.stringify(
    patterns.map(p => ({
      key: p.key,
      label: p.label.trim().slice(0, 12),
      start: p.start,
      end: p.end,
      enabled: p.enabled,
    })),
  );
}

/** 入力時の選択肢に出す枠だけを返す */
export function enabledPatterns(patterns: ShiftPattern[]): ShiftPattern[] {
  return patterns.filter(p => p.enabled);
}

/** 枠を引く。無効な枠でも返す（過去のシフトの表示に必要なため） */
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
 * 保存前の検証。ここで弾いた分は保存させない。
 * 「開始と終了が同じ」は0時間になるので許さない。
 * 日をまたぐ勤務（終了 < 開始）は現状のアプリが想定していないため許さない。
 */
export function validatePatterns(patterns: ShiftPattern[]): string[] {
  const errors: string[] = [];
  for (const p of patterns) {
    if (!isValidTime(p.start) || !isValidTime(p.end)) {
      errors.push(`${p.key}：時刻の形式が正しくありません`);
      continue;
    }
    if (p.start === p.end) {
      errors.push(`${p.key}：開始と終了が同じ時刻です`);
    } else if (p.end < p.start) {
      errors.push(`${p.key}：終了が開始より前になっています（日をまたぐ勤務には未対応です）`);
    }
  }
  if (!patterns.some(p => p.enabled)) {
    errors.push('少なくとも1つは「使う」にしてください');
  }
  return errors;
}
