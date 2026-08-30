import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { buildSessionCookieValue, verifySessionCookie, constantTimeEqual } from '../lib/session';
import type { SessionUser } from '../lib/types';

// lib/session.ts は署名のたびに process.env を読む（import 時ではない）ので、
// テスト本体が走る前のここで入れておけば足りる。
process.env.SESSION_SECRET = 'test-secret-for-unit-tests-only';

const staff: SessionUser = { id: 'u1', name: '田中', role: 'staff', storeId: 's1', storeSlug: 'main' };
const hq: SessionUser = { id: 'u2', name: '本部', role: 'hq_admin', storeId: null, storeSlug: null };

/** 本物と同じ形式でCookieを作る（テスト側で任意のペイロードを署名するため） */
function sign(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', process.env.SESSION_SECRET!).update(encoded).digest('hex');
  return `${encoded}.${sig}`;
}

describe('セッションCookieの検証', () => {
  test('発行したCookieはそのまま復元できる', () => {
    const got = verifySessionCookie(buildSessionCookieValue(staff));
    assert.deepEqual(got, staff);
  });

  test('本部権限は店舗を持たなくても通る', () => {
    const got = verifySessionCookie(buildSessionCookieValue(hq));
    assert.deepEqual(got, hq);
  });

  test('署名を書き換えたCookieは拒否する', () => {
    const raw = buildSessionCookieValue(staff);
    const [encoded] = raw.split('.');
    assert.equal(verifySessionCookie(`${encoded}.0000`), null);
  });

  test('中身を書き換えたCookieは拒否する（権限の詐称を防ぐ）', () => {
    const raw = buildSessionCookieValue(staff);
    const [, sig] = raw.split('.');
    const tampered = Buffer.from(
      JSON.stringify({ ...staff, role: 'hq_admin', exp: Date.now() + 60_000 }), 'utf8'
    ).toString('base64url');
    assert.equal(verifySessionCookie(`${tampered}.${sig}`), null);
  });

  test('期限切れは拒否する', () => {
    assert.equal(verifySessionCookie(sign({ ...staff, exp: Date.now() - 1 })), null);
  });

  test('店舗ロールなのに所属店舗が無いCookieは拒否する', () => {
    // 多店舗対応前に発行された古いCookie。通すと /s/null/... への無限リダイレクトになる
    assert.equal(
      verifySessionCookie(sign({ id: 'u1', name: '田中', role: 'staff', exp: Date.now() + 60_000 })),
      null
    );
  });

  test('壊れた文字列は例外を投げずに null を返す', () => {
    assert.equal(verifySessionCookie(''), null);
    assert.equal(verifySessionCookie('not-a-cookie'), null);
    assert.equal(verifySessionCookie('!!!.???'), null);
  });
});

describe('constantTimeEqual', () => {
  test('一致すれば true', () => assert.equal(constantTimeEqual('abc', 'abc'), true));
  test('不一致は false', () => assert.equal(constantTimeEqual('abc', 'abd'), false));
  test('長さが違っても例外を投げずに false', () => {
    assert.equal(constantTimeEqual('abc', 'abcdef'), false);
    assert.equal(constantTimeEqual('', 'a'), false);
  });
});
