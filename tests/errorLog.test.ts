import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintOf } from '../lib/errorLog';

// 指紋は「同じ不具合を1行にまとめる」ための鍵。
// ここが緩すぎると別々の不具合が混ざり、厳しすぎると同じ不具合が何十行も並んで
// 肝心のエラーが埋もれる。まとめ方の意図をテストで固定しておく。
describe('fingerprintOf', () => {
  test('同じ内容・同じ場所なら同じ指紋', () => {
    assert.equal(
      fingerprintOf('client', 'Cannot read properties of null', '/s/main/staff/shifts'),
      fingerprintOf('client', 'Cannot read properties of null', '/s/main/staff/shifts'),
    );
  });

  test('IDだけ違う同じ不具合はまとめる', () => {
    const a = fingerprintOf('server', 'user 11111111-2222-3333-4444-555555555555 not found', '/api/x');
    const b = fingerprintOf('server', 'user 99999999-8888-7777-6666-555555555555 not found', '/api/x');
    assert.equal(a, b);
  });

  test('日付だけ違う同じ不具合はまとめる', () => {
    assert.equal(
      fingerprintOf('server', 'shift 2026-09-01 の取得に失敗', '/api/x'),
      fingerprintOf('server', 'shift 2026-10-15 の取得に失敗', '/api/x'),
    );
  });

  test('数値だけ違う同じ不具合はまとめる', () => {
    assert.equal(
      fingerprintOf('client', 'row 12 の描画に失敗', '/x'),
      fingerprintOf('client', 'row 4567 の描画に失敗', '/x'),
    );
  });

  test('店舗が違うだけの同じ不具合はまとめる', () => {
    // 全店で同じ不具合が出たときに、店舗の数だけ行が並ぶのを避ける
    assert.equal(
      fingerprintOf('client', '同じエラー', '/s/main/staff/shifts'),
      fingerprintOf('client', '同じエラー', '/s/branch2/staff/shifts'),
    );
  });

  test('内容が違えば別の指紋', () => {
    assert.notEqual(
      fingerprintOf('client', 'エラーA', '/x'),
      fingerprintOf('client', 'エラーB', '/x'),
    );
  });

  test('場所が違えば別の指紋', () => {
    assert.notEqual(
      fingerprintOf('client', '同じエラー', '/a'),
      fingerprintOf('client', '同じエラー', '/b'),
    );
  });

  test('画面とサーバーは別々に数える', () => {
    assert.notEqual(
      fingerprintOf('client', '同じエラー', '/x'),
      fingerprintOf('server', '同じエラー', '/x'),
    );
  });

  test('パスが無くても指紋を作れる', () => {
    assert.equal(typeof fingerprintOf('server', 'メッセージ', null), 'string');
    assert.equal(fingerprintOf('server', 'メッセージ', null).length, 16);
  });
});
