import { createClient } from '@supabase/supabase-js';

// RLSを完全にバイパスする管理者クライアント。サーバー専用のRoute Handlerからのみ呼び出すこと。
// クライアントコンポーネントや共有モジュールからは絶対にimportしない。
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY が設定されていません');
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
