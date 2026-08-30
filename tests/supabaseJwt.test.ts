import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { appRoleFor, signSupabaseJwt, signJwtForSession, NIL_UUID } from '../lib/supabaseJwt';
import type { SessionUser } from '../lib/types';

// 鍵は最初の署名時に読み込まれるので、テスト本体が走る前のここで入れておけば足りる。
process.env.SUPABASE_JWT_SECRET = 'test-jwt-secret-for-unit-tests-only';

/** 署名検証はせず、中身のクレームだけ取り出す */
function claimsOf(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

describe('appRoleFor', () => {
  test('developer は RLS 上 hq_admin と同格に落とす', () => {
    assert.equal(appRoleFor('developer'), 'hq_admin');
  });
  test('それ以外はそのまま', () => {
    assert.equal(appRoleFor('admin'), 'admin');
    assert.equal(appRoleFor('staff'), 'staff');
    assert.equal(appRoleFor('hq_admin'), 'hq_admin');
  });
});

describe('signSupabaseJwt', () => {
  test('RLSが読むクレームを載せる', async () => {
    const c = claimsOf(await signSupabaseJwt({ sub: '11111111-2222-3333-4444-555555555555', app_role: 'staff', store_id: 'store-1' }));
    assert.equal(c.role, 'authenticated'); // PostgRESTがDBロールとして解釈する
    assert.equal(c.app_role, 'staff');
    assert.equal(c.store_id, 'store-1');
    assert.equal(c.aud, 'authenticated');
    assert.equal(c.sub, '11111111-2222-3333-4444-555555555555');
  });

  test('UUID形式でない sub はダミーUUIDに差し替える（DB側のuuidキャストを壊さない）', async () => {
    const c = claimsOf(await signSupabaseJwt({ sub: '__dev__', app_role: 'hq_admin', store_id: null }));
    assert.equal(c.sub, NIL_UUID);
  });

  test('既定の有効期限は1時間', async () => {
    const c = claimsOf(await signSupabaseJwt({ sub: NIL_UUID, app_role: 'staff', store_id: null }));
    assert.equal((c.exp as number) - (c.iat as number), 3600);
  });

  test('有効期限は指定できる', async () => {
    const c = claimsOf(await signSupabaseJwt({ sub: NIL_UUID, app_role: 'staff', store_id: null }, 60));
    assert.equal((c.exp as number) - (c.iat as number), 60);
  });

  test('署名は3つのパートに分かれた JWT になっている', async () => {
    const jwt = await signSupabaseJwt({ sub: NIL_UUID, app_role: 'staff', store_id: null });
    assert.equal(jwt.split('.').length, 3);
  });
});

describe('signJwtForSession', () => {
  test('開発者セッションは hq_admin 相当・店舗なしで発行される', async () => {
    const dev: SessionUser = { id: '__dev__', name: '開発者', role: 'developer', storeId: null, storeSlug: null };
    const c = claimsOf(await signJwtForSession(dev));
    assert.equal(c.app_role, 'hq_admin');
    assert.equal(c.store_id, null);
    assert.equal(c.sub, NIL_UUID);
  });

  test('店舗スタッフのJWTには自店のIDが入る', async () => {
    const staff: SessionUser = { id: '11111111-2222-3333-4444-555555555555', name: '田中', role: 'staff', storeId: 'store-1', storeSlug: 'main' };
    const c = claimsOf(await signJwtForSession(staff));
    assert.equal(c.app_role, 'staff');
    assert.equal(c.store_id, 'store-1');
  });
});
