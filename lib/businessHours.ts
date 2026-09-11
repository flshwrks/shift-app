/**
 * 店舗ごとの「シフトを入力できる時間帯」（点検項目 FN-9）。
 *
 * 2026-09-11 まで 8:00〜22:00 がコードに固定されていて、朝の早い店・夜の遅い店は
 * 実態と違う時刻に丸めて入力するしかなかった。
 *
 * **日をまたぐシフトは扱わない。** 終了は最大 24:00（＝その日の終わり）まで。
 * 深夜営業は現状の対象外という判断（2026-09-11）。もし必要になったら、
 * `shifts.start_time` / `end_time` はテキスト型で `timeToMinutes('26:00')` も
 * 正しく 1560 を返すため、**保存形式を変えずに** 26時表記へ広げられる。
 *
 * ここはDBにもReactにも触れない純粋な判定だけに保つこと（テストを軽く保つため）。
 */

export interface BusinessHours {
  /** 開始の「時」。0〜23 */
  startHour: number;
  /** 終了の「時」。1〜24。24 はその日の終わり（24:00） */
  endHour: number;
}

/** 従来コードに固定されていた値。既存の店舗はこれで何も変わらない */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = { startHour: 8, endHour: 22 };

/** 設定画面で選べる下限・上限 */
export const MIN_HOUR = 0;
export const MAX_HOUR = 24;
/** 短すぎる時間帯はシフトを入れられないので弾く */
export const MIN_SPAN_HOURS = 2;

export type BusinessHoursResult = { ok: true } | { ok: false; reason: string };

export function validateBusinessHours(startHour: number, endHour: number): BusinessHoursResult {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour)) {
    return { ok: false, reason: '時間帯は1時間きざみで指定してください' };
  }
  if (startHour < MIN_HOUR || startHour > MAX_HOUR - MIN_SPAN_HOURS) {
    return { ok: false, reason: `開始は ${MIN_HOUR}時〜${MAX_HOUR - MIN_SPAN_HOURS}時 の範囲で指定してください` };
  }
  if (endHour > MAX_HOUR || endHour < MIN_HOUR + MIN_SPAN_HOURS) {
    return { ok: false, reason: `終了は ${MIN_HOUR + MIN_SPAN_HOURS}時〜${MAX_HOUR}時 の範囲で指定してください` };
  }
  if (endHour - startHour < MIN_SPAN_HOURS) {
    return { ok: false, reason: `終了は開始より${MIN_SPAN_HOURS}時間以上あとにしてください` };
  }
  return { ok: true };
}

/**
 * 保存された文字列を読む。
 *
 * **壊れていても既定値で必ず動くこと。** ここで例外を投げると、設定が1つ壊れただけで
 * シフト画面全体が開かなくなる（`parsePatterns` と同じ方針）。
 */
export function parseBusinessHours(raw: string | null | undefined): BusinessHours {
  if (!raw) return DEFAULT_BUSINESS_HOURS;
  try {
    const parsed = JSON.parse(raw) as Partial<BusinessHours> | null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_BUSINESS_HOURS;
    const startHour = Number(parsed.startHour);
    const endHour = Number(parsed.endHour);
    if (!validateBusinessHours(startHour, endHour).ok) return DEFAULT_BUSINESS_HOURS;
    return { startHour, endHour };
  } catch {
    return DEFAULT_BUSINESS_HOURS;
  }
}

export function serializeBusinessHours(hours: BusinessHours): string {
  return JSON.stringify({ startHour: hours.startHour, endHour: hours.endHour });
}

/** 「8:00〜22:00」のような表示用の文字列 */
export function formatBusinessHours(hours: BusinessHours): string {
  const pad = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return `${pad(hours.startHour)}〜${pad(hours.endHour)}`;
}

/**
 * すでに保存されているシフトが、新しい時間帯からはみ出していないか。
 *
 * 時間帯を狭める操作は、**過去に入力済みのシフトを画面から見えなくしうる**。
 * 保存を止めはしないが、何件はみ出すかを管理者に見せて判断させるために使う。
 */
export function countOutOfRange(
  shifts: { start_time: string; end_time: string; shift_type: string }[],
  hours: BusinessHours,
): number {
  const min = hours.startHour * 60;
  const max = hours.endHour * 60;
  return shifts.filter(s => {
    if (s.shift_type === 'off') return false;
    const start = minutesOfStrict(s.start_time);
    const end = minutesOfStrict(s.end_time);
    // 読めない時刻は「はみ出している」と断定できないので数えない
    if (start === null || end === null) return false;
    return start < min || end > max;
  }).length;
}

/**
 * `HH:MM` として読めるときだけ分に直す。読めなければ null。
 *
 * ★`Number('')` は NaN ではなく 0★ なので、`split(':').map(Number)` して
 * `Number.isFinite` で弾く書き方だと、**空文字が 0:00 として通ってしまう**。
 * （実際にこの取り違えでテストが落ちた。2026-09-11）
 */
function minutesOfStrict(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > MAX_HOUR || mi > 59) return null;
  return h * 60 + mi;
}
