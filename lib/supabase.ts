import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-key';

// Supabase JWTはメモリ上のこの変数だけに保持する。localStorageに置くとXSS一発で
// 持ち出せる長命の資格情報になってしまうため、ページ遷移・リロードのたびに
// /api/session/token から都度取得し直す設計にしている（詳細は lib/auth.tsx）。
let currentToken: string | null = null;

// accessToken コールバックを渡すと supabase-js は Supabase Auth を使わず、
// このコールバックが返すJWTをPostgREST/RealtimeへのリクエストにBearerとして添付する
// （Supabase公式の「サードパーティ認証」パターン）。このアプリはSupabase Authを
// 使っていないため、auth名前空間が無効化されることは問題にならない。
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  accessToken: async () => currentToken,
});

// ログイン/ログアウト/トークン更新の際に呼び出し、メモリ上のトークンを差し替える。
// 接続中のRealtimeソケットにも新しいトークンを再送し、購読中のチャンネルを再認可する。
export function setSupabaseAccessToken(token: string | null): void {
  currentToken = token;
  supabase.realtime.setAuth(token ?? undefined).catch(() => {});
}
