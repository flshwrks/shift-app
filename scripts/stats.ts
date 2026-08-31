/**
 * 本番の利用実績を数える。
 *
 *   npm run stats
 *
 * 目的は2つ。
 *  1. 運用の可視化（どれだけ使われているかを定期的に把握する）
 *  2. 会社への説明材料（稼働期間・利用者数・入力件数は、口頭で言えないと説得力が出ない）
 *
 * ★このスクリプトは氏名・時給・勤務時間などの個人データを一切出力しない。
 *   件数と日付だけを数える。出力をそのまま資料に貼れるようにするための制約。
 *   同じ理由で、出力をファイルに書かない（画面に出すだけ）。
 *   データの持ち出しが必要なときは npm run backup を使うこと。
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です。');
  console.error('npm run stats は .env.local を読み込みます（npm run check:env で確認できます）。');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** 件数だけ取る（行本体は転送しない） */
async function count(table: string, apply?: (q: any) => any): Promise<number | null> {
  let q = db.from(table).select('id', { count: 'exact', head: true });
  if (apply) q = apply(q);
  const { count: n, error } = await q;
  // テーブルが無い環境（マイグレーション未適用）では null を返して「—」表示にする
  if (error) return null;
  return n ?? 0;
}

function fmt(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('ja-JP');
}

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function main() {
  console.log('\n=== シフト管理アプリ 利用実績 ===');
  console.log(`集計日時: ${new Date().toLocaleString('ja-JP')}\n`);

  // ---- 稼働期間 ----
  const [{ data: oldest }, { data: newest }] = await Promise.all([
    db.from('shifts').select('date').order('date', { ascending: true }).limit(1).maybeSingle(),
    db.from('shifts').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (oldest?.date && newest?.date) {
    const from = new Date(oldest.date);
    const to = new Date(newest.date);
    const months =
      (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
    console.log('【稼働期間】');
    console.log(`  ${oldest.date} 〜 ${newest.date}（${months}か月分のシフトが入っている）`);
  }

  // ---- 規模 ----
  const [stores, users, admins, hqAdmins, staff] = await Promise.all([
    count('stores'),
    count('users'),
    count('users', q => q.eq('role', 'admin')),
    count('users', q => q.eq('role', 'hq_admin')),
    count('users', q => q.eq('role', 'staff')),
  ]);
  console.log('\n【規模】');
  console.log(`  店舗数        ${fmt(stores)}`);
  console.log(`  利用者数      ${fmt(users)}（スタッフ ${fmt(staff)} / 店舗管理者 ${fmt(admins)} / 本部管理者 ${fmt(hqAdmins)}）`);

  // ---- 店舗別（テスト用の店舗が混ざるので、実店舗の数字はここで見る）----
  const { data: storeRows } = await db.from('stores').select('id, name, slug').order('created_at');
  if (storeRows?.length) {
    console.log('\n【店舗別】');
    for (const st of storeRows as { id: string; name: string; slug: string }[]) {
      const [u, sh, last] = await Promise.all([
        count('users', q => q.eq('store_id', st.id)),
        count('shifts', q => q.eq('store_id', st.id)),
        db.from('shifts').select('date').eq('store_id', st.id)
          .order('date', { ascending: false }).limit(1).maybeSingle(),
      ]);
      const tail = last.data?.date ? `最終 ${last.data.date}` : 'シフト未入力';
      console.log(`  ${st.name}（${st.slug}）  ${fmt(u)}人 / シフト ${fmt(sh)}件 / ${tail}`);
    }
  }

  // ---- 入力量 ----
  const [shifts, confirmed, requests, surveys, responses, feedback] = await Promise.all([
    count('shifts'),
    count('shifts', q => q.eq('status', 'confirmed')),
    count('shift_requests'),
    count('surveys'),
    count('survey_responses'),
    count('feedback'),
  ]);
  console.log('\n【入力量】');
  console.log(`  シフト        ${fmt(shifts)} 件（うち確定 ${fmt(confirmed)} 件）`);
  console.log(`  交代の募集    ${fmt(requests)} 件`);
  console.log(`  アンケート    ${fmt(surveys)} 件 / 回答 ${fmt(responses)} 件`);
  console.log(`  要望・不具合  ${fmt(feedback)} 件`);

  // ---- 直近6か月の推移（継続して使われているかが分かる）----
  console.log('\n【直近6か月のシフト件数】');
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const n = await count('shifts', q => q.gte('date', iso(from)).lte('date', iso(to)));
    const bar = '█'.repeat(Math.min(40, Math.round((n ?? 0) / 25)));
    console.log(`  ${ym(from)}  ${String(fmt(n)).padStart(6)} 件  ${bar}`);
  }

  // ---- 運用の健全性（点検で聞かれる項目）----
  const [audit, errNew, errDone] = await Promise.all([
    count('audit_logs'),
    count('error_logs', q => q.eq('status', 'new')),
    count('error_logs', q => q.eq('status', 'done')),
  ]);
  console.log('\n【運用】');
  console.log(`  操作の記録    ${fmt(audit)} 件`);
  console.log(`  エラーの記録  未対応 ${fmt(errNew)} 件 / 対応済み ${fmt(errDone)} 件`);
  console.log('');
}

main().catch(e => {
  console.error('集計に失敗しました:', e);
  process.exit(1);
});
