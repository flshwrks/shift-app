/**
 * 本番データベースの中身を、手元にJSONで丸ごと書き出す。
 *
 *   npm run backup            → backups/YYYY-MM-DD_HHmm/ に出力
 *   npm run backup -- --out=D:/somewhere
 *
 * 目的は2つ。
 *  1. Supabaseの障害・アカウント停止・誤操作でデータが失われたときの最後の砦
 *  2. 別のPostgreSQLへ移すときの持ち出し（このJSONから復元スクリプトを書ける）
 *
 * Supabaseの自動バックアップとは別物。あちらはSupabaseが生きている前提の仕組みで、
 * こちらは「Supabaseごと失う」場合に効く。詳細は docs/OPERATIONS.md の「フォールバック体制」。
 *
 * ★このスクリプトは SUPABASE_SERVICE_ROLE_KEY（RLSを無視する最強の鍵）を使う。
 *   出力されるJSONには全店舗の氏名・勤務予定・時給が平文で入る。置き場所に注意すること。
 *   pin_hash は列単位で除外している（復元時は再発行する運用）。
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// このアプリが所有するテーブル。inv_* は在庫管理アプリのもので、あちらの責任範囲なので触らない。
const TABLES = [
  'stores',
  'users',
  'shifts',
  'app_settings',
  'shift_requests',
  'shift_request_targets',
  'surveys',
  'survey_options',
  'survey_responses',
  'feedback',
] as const;

// 漏れたときの被害が大きく、かつ復元時は再発行すればよい列は持ち出さない
const EXCLUDED_COLUMNS: Record<string, string[]> = {
  users: ['pin_hash', 'failed_pin_attempts', 'pin_locked_until'],
};

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です（.env.local を読み込んで実行してください）');
    process.exit(1);
  }

  const outArg = process.argv.find(a => a.startsWith('--out='));
  const outDir = join(outArg ? outArg.slice('--out='.length) : 'backups', stamp());
  mkdirSync(outDir, { recursive: true });

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const summary: Record<string, number> = {};

  for (const table of TABLES) {
    // 1000件ずつ取り、件数が増えても取りこぼさないようにする
    const rows: unknown[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1);
      if (error) {
        console.error(`✖ ${table}: ${error.message}`);
        process.exit(1);
      }
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }

    const drop = EXCLUDED_COLUMNS[table];
    const cleaned = drop
      ? rows.map(r => Object.fromEntries(Object.entries(r as object).filter(([k]) => !drop.includes(k))))
      : rows;

    writeFileSync(join(outDir, `${table}.json`), JSON.stringify(cleaned, null, 2), 'utf8');
    summary[table] = cleaned.length;
    console.log(`✔ ${table.padEnd(24)} ${String(cleaned.length).padStart(6)} 件`);
  }

  writeFileSync(join(outDir, '_meta.json'), JSON.stringify({
    takenAt: new Date().toISOString(),
    supabaseUrl: url,
    tables: summary,
    excludedColumns: EXCLUDED_COLUMNS,
    note: 'pin_hash は含まれていない。復元後は暗証番号を再発行すること。',
  }, null, 2), 'utf8');

  console.log(`\n出力先: ${outDir}`);
  console.log('この中身には全店舗の氏名・勤務予定・時給が平文で入っている。保管場所に注意すること。');
}

main();
