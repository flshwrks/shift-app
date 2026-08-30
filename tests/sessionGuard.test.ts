import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileSession, finalizeSession, type UserRow } from '../lib/sessionGuard';
import type { SessionUser } from '../lib/types';

const staff: SessionUser = { id: 'u1', name: '田中', role: 'staff', storeId: 'store-1', storeSlug: 'main' };
const admin: SessionUser = { id: 'u2', name: '川端', role: 'admin', storeId: 'store-1', storeSlug: 'main' };
const hq: SessionUser = { id: 'u3', name: '本部', role: 'hq_admin', storeId: null, storeSlug: null };

const row = (over: Partial<UserRow> = {}): UserRow =>
  ({ id: 'u1', role: 'staff', store_id: 'store-1', ...over });

describe('reconcileSession（Cookieの内容とDBの突き合わせ）', () => {
  test('DBに行が無ければ無効（退職者の締め出し）', () => {
    // F-2の本体。ここが unchanged を返すと、削除済みの人が最大30日データを見られる
    assert.deepEqual(reconcileSession(staff, null), { kind: 'invalid' });
  });

  test('一致していればそのまま通す', () => {
    assert.deepEqual(reconcileSession(staff, row()), { kind: 'unchanged' });
  });

  test('権限を落とされていれば変更として検出する', () => {
    assert.deepEqual(
      reconcileSession(admin, row({ id: 'u2', role: 'staff' })),
      { kind: 'changed', role: 'staff', storeId: 'store-1' },
    );
  });

  test('権限を上げられた場合も検出する', () => {
    assert.deepEqual(
      reconcileSession(staff, row({ role: 'admin' })),
      { kind: 'changed', role: 'admin', storeId: 'store-1' },
    );
  });

  test('所属店舗が変わっていれば検出する', () => {
    assert.deepEqual(
      reconcileSession(staff, row({ store_id: 'store-2' })),
      { kind: 'changed', role: 'staff', storeId: 'store-2' },
    );
  });

  test('DB側の store_id が null なら null として扱う（undefined と混同しない）', () => {
    assert.deepEqual(
      reconcileSession(hq, { id: 'u3', role: 'hq_admin', store_id: null }),
      { kind: 'unchanged' },
    );
  });
});

describe('finalizeSession（変更後のセッションの組み立て）', () => {
  test('降格したら新しい権限で組み立て直す', () => {
    assert.deepEqual(finalizeSession(admin, 'staff', 'store-1', 'main'), {
      id: 'u2', name: '川端', role: 'staff', storeId: 'store-1', storeSlug: 'main',
    });
  });

  test('本部権限に上がったら店舗情報は持ち越さない', () => {
    // 持ち越すと、本部なのに特定店舗のスコープが残る
    assert.deepEqual(finalizeSession(admin, 'hq_admin', 'store-1', 'main'), {
      id: 'u2', name: '川端', role: 'hq_admin', storeId: null, storeSlug: null,
    });
  });

  test('店舗ロールなのに所属店舗が分からなければ無効にする', () => {
    // 通すと /s/null/... への無限リダイレクトや、店舗なしのデータ書込みが起きる
    assert.equal(finalizeSession(staff, 'staff', null, null), null);
    assert.equal(finalizeSession(staff, 'staff', 'store-1', null), null);
    assert.equal(finalizeSession(staff, 'staff', null, 'main'), null);
  });

  test('店舗を移った場合は新しい店舗で組み立てる', () => {
    assert.deepEqual(finalizeSession(staff, 'staff', 'store-2', 'branch'), {
      id: 'u1', name: '田中', role: 'staff', storeId: 'store-2', storeSlug: 'branch',
    });
  });
});
