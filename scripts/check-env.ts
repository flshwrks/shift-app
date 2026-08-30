/**
 * 必要な環境変数が揃っているかを確認する。
 *
 *   npm run check:env
 *
 * 「動かしてみたら500だった」を防ぐための事前確認。
 * 引き継ぎ直後や、Vercelの環境変数を触ったあとに実行する。
 * .env.local があればそれも読む（無くても process.env だけで判定する）。
 */
import { existsSync, readFileSync } from 'node:fs';

interface Spec {
  name: string;
  required: boolean;
  minLength?: number;
  what: string;
  missing: string;
}

const SPECS: Spec[] = [
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, what: 'データベースの接続先',
    missing: 'アプリ全体が動かない' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, what: '公開前提の匿名キー',
    missing: 'アプリ全体が動かない' },
  { name: 'SESSION_SECRET', required: true, minLength: 16, what: 'セッションCookieの署名鍵',
    missing: 'ログイン系のAPIが500で落ちる' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, what: '管理操作用の鍵（サーバー限定）',
    missing: 'スタッフ・店舗の追加や削除ができない' },
  { name: 'SUPABASE_JWT_SECRET', required: true, what: 'DB用トークンの署名鍵',
    missing: 'ログインできてもデータが読めない' },
  { name: 'DEV_LOGIN_PASSWORD', required: false, minLength: 24, what: '開発者ログインのパスワード',
    missing: '開発者ログインが503になる（本部管理者ログインは使える）' },
  { name: 'GITHUB_TOKEN', required: false, what: '要望をGitHub Issueにする（任意）',
    missing: 'Issueの自動作成だけがスキップされる' },
];

/** .env.local を最小限の解釈で読む（値のクォートだけ剥がす） */
function loadEnvLocal(): Record<string, string> {
  if (!existsSync('.env.local')) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const local = loadEnvLocal();
const read = (name: string) => process.env[name] || local[name] || '';

let ng = 0;
let warn = 0;

console.log(existsSync('.env.local') ? '.env.local を読み込んで確認します\n' : 'process.env だけで確認します\n');

for (const spec of SPECS) {
  const value = read(spec.name);
  const short = spec.minLength !== undefined && value.length > 0 && value.length < spec.minLength;

  if (!value) {
    if (spec.required) { ng++; console.log(`✖ ${spec.name}\n    未設定 — ${spec.missing}`); }
    else { warn++; console.log(`△ ${spec.name}\n    未設定 — ${spec.missing}`); }
  } else if (short) {
    warn++;
    console.log(`△ ${spec.name}\n    ${spec.minLength}文字未満（現在${value.length}文字） — ${spec.missing}`);
  } else {
    console.log(`✔ ${spec.name}  （${spec.what}）`);
  }
}

console.log('');
if (ng > 0) {
  console.log(`必須の環境変数が ${ng} 件足りません。.env.local.example と docs/OPERATIONS.md §3 を参照してください。`);
  process.exit(1);
}
if (warn > 0) {
  console.log(`必須は揃っています（注意が ${warn} 件）。`);
} else {
  console.log('すべて揃っています。');
}
