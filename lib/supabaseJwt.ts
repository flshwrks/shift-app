import { SignJWT } from 'jose';
import type { SessionUser, UserRole } from './types';

export type AppRole = 'hq_admin' | 'admin' | 'staff';

// developer はDB非保存の合成ロールなので、RLS上は hq_admin と同格に扱う
export function appRoleFor(role: UserRole): AppRole {
  return role === 'developer' ? 'hq_admin' : role;
}

export interface SupabaseJwtClaims {
  sub: string; // users.id。UUIDでない場合は NIL_UUID を使うこと
  app_role: AppRole;
  store_id: string | null;
}

// developer の '__dev__' のようなUUID形式でないIDをそのまま sub に入れると、
// DB側の uuid キャストが失敗する（例: auth.uid() を uuid列と比較する場面）ため、
// UUID形式でない場合はこのダミー値に置き換える。
export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_TTL_SECONDS = 3600;

// 秘密鍵は環境変数から一度だけ読み込み、以降の署名呼び出し（ログイン・45分毎のトークンリフレッシュ）で使い回す
let cachedSecretKey: Uint8Array | null = null;
function getSecretKey(): Uint8Array {
  if (cachedSecretKey) return cachedSecretKey;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not set');
  cachedSecretKey = new TextEncoder().encode(secret);
  return cachedSecretKey;
}

// HS256でSupabase用JWTを署名する。Supabaseの「サードパーティ認証」パターンに従い、
// RLSポリシーの auth.jwt() から app_role/store_id を読めるようにする。
// sub のUUID形式チェックはここで一元的に行う（呼び出し元ごとに個別対応させない）。
export async function signSupabaseJwt(claims: SupabaseJwtClaims, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const sub = UUID_RE.test(claims.sub) ? claims.sub : NIL_UUID;
  return new SignJWT({
    role: 'authenticated', // PostgRESTがDBロールとして解釈するクレーム
    app_role: claims.app_role,
    store_id: claims.store_id,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getSecretKey());
}

// SessionUser から JWT を作る便利関数。各APIルートはこれを使う。
export async function signJwtForSession(user: SessionUser): Promise<string> {
  return signSupabaseJwt({
    sub: user.id,
    app_role: appRoleFor(user.role),
    store_id: user.storeId,
  });
}
