/**
 * KING OF TIME「スケジュールデータ［CSV］」インポート用のCSVを組み立てる。
 *
 * KOT側の仕様（2026-08 時点。出典は docs/KOT_INTEGRATION.md）:
 * - 列の構成は固定ではなく、KOTの管理画面で「入力レイアウト」を作って決める。
 *   つまり **KOT側をこちらの出力に合わせられる** ので、アプリは1種類の並びだけ出せばよい。
 * - 必須は「勤務日」と「従業員コード」の2つだけ。
 * - 勤務日は yyyyMMdd / yyyy/MM/dd のどちらか。時刻は「対象日HH:mm」（対象日=当日/前日/翌日、当日は省略可）。
 * - 従業員コード・パターンコードはどちらも半角英数3〜10文字。
 * - 1ファイル10,000件まで。取込日の3ヶ月前〜1年1ヶ月後の範囲のみ。
 * - 既にスケジュールがある日は「更新」扱いになる。
 *
 * このファイルはReactに依存しない純関数だけを置くこと（画面側にKOTの仕様知識を漏らさないため）。
 */
import type { Shift, ShiftType, User } from './types';
import { SHIFT_PRESETS } from './types';

/** パターンコードを割り当てる対象。custom は時刻が毎回違うのでコード未設定でも許容する */
export const KOT_PATTERN_TARGETS: ShiftType[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'custom', 'off'];

export type KotDateFormat = 'slash' | 'compact';
/** pattern=パターンコードのみ / time=予定時刻のみ / both=両方（KOT側で時刻がパターンの時刻を上書きする） */
export type KotOutputMode = 'pattern' | 'time' | 'both';

export interface KotSettings {
  dateFormat: KotDateFormat;
  outputMode: KotOutputMode;
  /** 従業員コードのゼロ埋め桁数。0 なら埋めない。KOT側が "007" 形式のとき用 */
  codeDigits: number;
  /** 休み(off)の行も出力するか。KOTに公休を登録したい場合に使う */
  includeOff: boolean;
  /** 申請中(draft)のシフトも含めるか。既定は確定済みのみ */
  includeDraft: boolean;
  /** 1行目にタイトル行を付けるか。KOTのテンプレートに合わせる */
  header: boolean;
}

export const KOT_DEFAULT_SETTINGS: KotSettings = {
  dateFormat: 'slash',
  outputMode: 'both',
  codeDigits: 0,
  includeOff: false,
  includeDraft: false,
  header: true,
};

// ---- app_settings のキー ------------------------------------------------
// 専用テーブルを足さずに app_settings(store_id, key) に載せる。
// 時給(wage_<user_id>)と同じ方式。このDBは在庫管理アプリと共有しているため、
// スキーマ変更のリスクを取らない（CLAUDE.md 参照）。

export const kotCodeKey = (userId: string) => `kot_code_${userId}`;
export const kotPatternKey = (type: ShiftType) => `kot_pattern_${type}`;

export const KOT_SETTING_KEYS = {
  dateFormat: 'kot_date_format',
  outputMode: 'kot_output_mode',
  codeDigits: 'kot_code_digits',
  includeOff: 'kot_include_off',
  includeDraft: 'kot_include_draft',
  header: 'kot_header',
} as const;

/** 出力設定＋全パターンコードのキー一覧（従業員コードはユーザー数に依存するので別に組み立てる） */
export function kotConfigKeys(): string[] {
  return [...Object.values(KOT_SETTING_KEYS), ...KOT_PATTERN_TARGETS.map(kotPatternKey)];
}

/** 従業員コードの最大桁数。KOTのコード制約（半角英数3〜10文字）の上限と同じ */
export const KOT_MAX_CODE_DIGITS = 10;

/** ゼロ埋め桁数を 0〜KOT_MAX_CODE_DIGITS に収める。0 は「桁揃えしない」 */
export function clampKotCodeDigits(value: string | number): number {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (isNaN(n)) return 0;
  return Math.min(KOT_MAX_CODE_DIGITS, Math.max(0, n));
}

export function parseKotSettings(map: Record<string, string>): KotSettings {
  const d = KOT_DEFAULT_SETTINGS;
  const rawMode = map[KOT_SETTING_KEYS.outputMode];
  const rawDigits = map[KOT_SETTING_KEYS.codeDigits];
  return {
    dateFormat: map[KOT_SETTING_KEYS.dateFormat] === 'compact' ? 'compact' : d.dateFormat,
    outputMode: rawMode === 'pattern' || rawMode === 'time' ? rawMode : d.outputMode,
    codeDigits: rawDigits === undefined ? d.codeDigits : clampKotCodeDigits(rawDigits),
    includeOff: map[KOT_SETTING_KEYS.includeOff] === '1',
    includeDraft: map[KOT_SETTING_KEYS.includeDraft] === '1',
    header: map[KOT_SETTING_KEYS.header] !== '0',
  };
}

/**
 * 設定1項目を app_settings に入れる形（キーと文字列値）にする。`parseKotSettings` と対。
 * 保存形式を知っているのはこの2つだけにしたいので、画面側で '1'/'0' を組み立てないこと。
 */
export function serializeKotSetting<K extends keyof KotSettings>(
  key: K,
  value: KotSettings[K]
): { key: string; value: string } {
  return {
    key: KOT_SETTING_KEYS[key],
    value: typeof value === 'boolean' ? (value ? '1' : '0') : String(value),
  };
}

// ---- 値の整形・検証 -----------------------------------------------------

/** KOTの従業員コード・パターンコードの共通制約（半角英数3〜10文字） */
export const KOT_CODE_PATTERN = /^[0-9A-Za-z]{3,10}$/;

/**
 * 従業員コードをKOTの桁数に揃える。KOT側が "007" のようなゼロ埋め運用のとき、
 * 桁が足りないと「該当する従業員がいない」という原因の分かりにくいエラーになる。
 * 数字だけのコードにしかゼロ埋めは適用しない。
 */
export function padKotCode(code: string, digits: number): string {
  const v = code.trim();
  if (!digits || !/^\d+$/.test(v)) return v;
  return v.padStart(digits, '0');
}

export function formatKotDate(isoDate: string, format: KotDateFormat): string {
  const [y, m, d] = isoDate.split('-');
  return format === 'compact' ? `${y}${m}${d}` : `${y}/${m}/${d}`;
}

/**
 * 予定時刻をKOTの「対象日HH:mm」形式にする。
 * 当日は接頭辞を省略できるので通常は "HH:mm" のまま。
 * 終了が開始以前なら日をまたぐ勤務とみなして「翌日」を付ける。
 */
export function formatKotTime(time: string, nextDay = false): string {
  return nextDay ? `翌日${time}` : time;
}

// ---- CSV組み立て --------------------------------------------------------

export type KotIssueLevel = 'error' | 'warn';

export interface KotIssue {
  level: KotIssueLevel;
  message: string;
}

export interface KotBuildInput {
  shifts: Shift[];
  users: User[];
  /** user_id → KOT従業員コード。未入力のユーザーはキーごと持たない */
  codes: Record<string, string>;
  /** シフト種別 → KOTパターンコード */
  patterns: Partial<Record<ShiftType, string>>;
  settings: KotSettings;
  /** 期間チェックの基準日。既定は今日 */
  today?: Date;
}

export interface KotBuildResult {
  columns: string[];
  rows: string[][];
  csv: string;
  /** 出力対象外になったシフト件数 */
  skipped: number;
  issues: KotIssue[];
}

function columnsFor(mode: KotOutputMode): string[] {
  const base = ['勤務日', '従業員コード'];
  if (mode === 'time') return [...base, '出勤予定', '退勤予定'];
  if (mode === 'pattern') return [...base, 'パターンコード'];
  return [...base, 'パターンコード', '出勤予定', '退勤予定'];
}

/** RFC4180: ダブルクォート・カンマ・改行を含む値だけ囲む */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** KOTが受け付ける取込対象期間（取込日の3ヶ月前〜1年1ヶ月後）に収まっているか */
function isWithinKotRange(isoDate: string, today: Date): boolean {
  const target = new Date(`${isoDate}T00:00:00`);
  const from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  const to = new Date(today.getFullYear(), today.getMonth() + 13, today.getDate());
  return target >= from && target <= to;
}

export const KOT_MAX_ROWS = 10000;

export function buildKotCsv(input: KotBuildInput): KotBuildResult {
  const { shifts, users, codes, patterns, settings } = input;
  const today = input.today ?? new Date();
  const columns = columnsFor(settings.outputMode);
  const rows: string[][] = [];
  const issues: KotIssue[] = [];
  let skipped = 0;

  const userById = new Map(users.map(u => [u.id, u]));
  const missingCode = new Set<string>();
  const invalidCode = new Set<string>();
  // 「パターンが無いせいで行が落ちた」のと「パターン無しでも時刻だけで出せた」のは
  // 深刻さが違うので分けて数える（前者はエラー、後者は知らせるだけ）
  const droppedNoPattern = new Set<ShiftType>();
  const emittedNoPattern = new Set<ShiftType>();
  const outOfRange = new Set<string>();

  // 日付→スタッフ表示順で並べる。KOT側は順不同で構わないが、
  // 目視で確認したときにシフト表と同じ並びだと照合しやすい
  const orderOf = (id: string) => userById.get(id)?.display_order ?? Number.MAX_SAFE_INTEGER;
  const sorted = [...shifts].sort((a, b) =>
    a.date === b.date ? orderOf(a.user_id) - orderOf(b.user_id) : a.date.localeCompare(b.date)
  );

  for (const shift of sorted) {
    if (!settings.includeDraft && shift.status !== 'confirmed') { skipped++; continue; }
    if (shift.shift_type === 'off' && !settings.includeOff) { skipped++; continue; }

    const user = userById.get(shift.user_id);
    if (!user) { skipped++; continue; }

    const rawCode = (codes[shift.user_id] ?? '').trim();
    if (!rawCode) { missingCode.add(user.name); skipped++; continue; }
    const code = padKotCode(rawCode, settings.codeDigits);
    if (!KOT_CODE_PATTERN.test(code)) { invalidCode.add(`${user.name}（${code}）`); skipped++; continue; }

    const pattern = (patterns[shift.shift_type] ?? '').trim();
    if (!pattern) {
      // パターンコードしか出さない設定、または休み（時刻では表現できない）の場合、
      // コードが無い行はKOTに渡しても何も起きないので落とす
      if (settings.outputMode === 'pattern' || shift.shift_type === 'off') {
        droppedNoPattern.add(shift.shift_type);
        skipped++;
        continue;
      }
      // custom は時刻が毎回違うのでパターンコードが無いのが正常。
      // 'time' はそもそもパターン列を出さないので知らせる必要もない
      if (settings.outputMode === 'both' && shift.shift_type !== 'custom') {
        emittedNoPattern.add(shift.shift_type);
      }
    }

    if (!isWithinKotRange(shift.date, today)) outOfRange.add(shift.date);

    const cells = [formatKotDate(shift.date, settings.dateFormat), code];
    if (settings.outputMode !== 'time') cells.push(pattern);
    if (settings.outputMode !== 'pattern') {
      if (shift.shift_type === 'off') {
        // 休みの行に予定時刻は入れない（空欄のままKOTに渡す）
        cells.push('', '');
      } else {
        const preset = shift.shift_type !== 'custom' ? SHIFT_PRESETS[shift.shift_type] : null;
        const start = shift.start_time || preset?.start || '';
        const end = shift.end_time || preset?.end || '';
        cells.push(formatKotTime(start), formatKotTime(end, !!start && !!end && end <= start));
      }
    }
    rows.push(cells);
  }

  if (missingCode.size > 0) {
    issues.push({ level: 'error', message: `従業員コード未設定のため除外: ${[...missingCode].join('、')}` });
  }
  if (invalidCode.size > 0) {
    issues.push({ level: 'error', message: `従業員コードが半角英数3〜10文字ではないため除外: ${[...invalidCode].join('、')}` });
  }
  if (droppedNoPattern.size > 0) {
    issues.push({ level: 'error', message: `パターンコード未設定のため除外: ${[...droppedNoPattern].join('、')}` });
  }
  if (emittedNoPattern.size > 0) {
    issues.push({
      level: 'warn',
      message: `パターンコード未設定の種別があります（予定時刻だけで出力します）: ${[...emittedNoPattern].join('、')}`,
    });
  }
  if (outOfRange.size > 0) {
    issues.push({
      level: 'warn',
      message: `KOTの取込可能期間（3ヶ月前〜1年1ヶ月後）外の日付が含まれます: ${[...outOfRange].sort()[0]} など${outOfRange.size}日`,
    });
  }
  if (rows.length > KOT_MAX_ROWS) {
    issues.push({
      level: 'error',
      message: `1ファイル${KOT_MAX_ROWS.toLocaleString()}件までです（現在 ${rows.length.toLocaleString()}件）。月を分けて出力してください`,
    });
  }
  if (rows.length === 0) {
    issues.push({ level: 'warn', message: '出力対象のシフトがありません' });
  }

  const lines = settings.header ? [columns, ...rows] : rows;
  // KOTはCRLF改行を想定している。末尾にも改行を1つ入れる
  const csv = lines.map(cells => cells.map(csvCell).join(',')).join('\r\n') + (lines.length ? '\r\n' : '');

  return { columns, rows, csv, skipped, issues };
}
