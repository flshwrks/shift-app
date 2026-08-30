import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { homePathFor, storeLoginPath, HQ_HOME } from '../lib/routes';

describe('homePathFor（ログイン後の行き先）', () => {
  // ここを間違えるとログイン直後に無限リダイレクトが起きる（2026-08-08に実際に発生）。
  test('本部権限は店舗を無視して店舗一覧へ', () => {
    assert.equal(homePathFor('hq_admin', null), HQ_HOME);
    assert.equal(homePathFor('hq_admin', 'main'), HQ_HOME);
  });
  test('developer は hq_admin と同じ扱い', () => {
    assert.equal(homePathFor('developer', null), HQ_HOME);
  });
  test('店舗管理者は自店の管理画面へ', () => {
    assert.equal(homePathFor('admin', 'main'), '/s/main/admin/schedule');
  });
  test('スタッフは自店の申請画面へ', () => {
    assert.equal(homePathFor('staff', 'main'), '/s/main/staff/shifts');
  });
  test('店舗ロールなのに店舗が無い場合はトップへ逃がす（/s/null/... を作らない）', () => {
    assert.equal(homePathFor('staff', null), '/');
    assert.equal(homePathFor('admin', null), '/');
  });
});

test('storeLoginPath', () => {
  assert.equal(storeLoginPath('main'), '/s/main/login');
});
