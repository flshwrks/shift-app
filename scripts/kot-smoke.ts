/**
 * lib/kot.ts が出すCSVを目視確認するための確認用スクリプト。`npx tsx scripts/kot-smoke.ts`。
 *
 * KOT側の取り込みが失敗したときに「アプリの出力が変わったのか、KOTの設定が変わったのか」を
 * 切り分けられるよう、ゼロ埋め・休み・カスタム・申請中・不正コードを一通り含めてある。
 */
import { buildKotCsv, KOT_DEFAULT_SETTINGS, padKotCode } from '../lib/kot';
import type { Shift, User } from '../lib/types';

const users: User[] = [
  { id: 'u1', name: '田中', role: 'staff', created_at: '', display_order: 1 },
  { id: 'u2', name: '佐藤', role: 'staff', created_at: '', display_order: 2 },
  { id: 'u3', name: '未設定さん', role: 'staff', created_at: '', display_order: 3 },
];

const shift = (id: string, user_id: string, date: string, type: Shift['shift_type'], start: string, end: string, status: Shift['status'] = 'confirmed'): Shift => ({
  id, user_id, date, shift_type: type, start_time: start, end_time: end, comment: '', status, created_at: '', updated_at: '',
});

const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, '0')}`;

const shifts: Shift[] = [
  shift('s1', 'u2', `${ym}-01`, 'A', '08:00', '13:00'),
  shift('s2', 'u1', `${ym}-01`, 'E', '13:00', '22:00'),
  shift('s3', 'u1', `${ym}-02`, 'custom', '10:30', '16:00'),
  shift('s4', 'u2', `${ym}-02`, 'off', '00:00', '00:00'),
  shift('s5', 'u1', `${ym}-03`, 'B', '09:00', '14:00', 'draft'),
  shift('s6', 'u3', `${ym}-03`, 'A', '08:00', '13:00'),
];

const codes = { u1: '7', u2: 'ABC12' };
const patterns = { A: '001', B: '002', E: '005', off: '900' } as const;

function show(title: string, settings = KOT_DEFAULT_SETTINGS) {
  const r = buildKotCsv({ shifts, users, codes, patterns, settings });
  console.log(`\n===== ${title} =====`);
  console.log('列:', r.columns.join(' | '));
  console.log(JSON.stringify(r.csv));
  console.log('出力', r.rows.length, '件 / 対象外', r.skipped, '件');
  r.issues.forEach(i => console.log(`  [${i.level}] ${i.message}`));
}

show('既定（確定のみ・パターン＋時刻）');
show('3桁ゼロ埋め・休みも出力', { ...KOT_DEFAULT_SETTINGS, codeDigits: 3, includeOff: true });
show('パターンのみ・yyyyMMdd・タイトル行なし', { ...KOT_DEFAULT_SETTINGS, outputMode: 'pattern', dateFormat: 'compact', header: false });
show('時刻のみ・申請中も含める', { ...KOT_DEFAULT_SETTINGS, outputMode: 'time', includeDraft: true });

console.log('\npadKotCode:', padKotCode('7', 3), padKotCode('ABC12', 3), padKotCode('7', 0));
