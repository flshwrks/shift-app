import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BUSINESS_HOURS,
  parseBusinessHours,
  serializeBusinessHours,
  validateBusinessHours,
  formatBusinessHours,
  countOutOfRange,
} from '../lib/businessHours';

describe('受付時間帯の検証', () => {
  test('ふつうの時間帯は通る', () => {
    assert.deepEqual(validateBusinessHours(8, 22), { ok: true });
    assert.deepEqual(validateBusinessHours(6, 24), { ok: true });
    assert.deepEqual(validateBusinessHours(0, 24), { ok: true });
  });

  test('終了が開始より前・同じは弾く', () => {
    assert.equal(validateBusinessHours(22, 8).ok, false);
    assert.equal(validateBusinessHours(10, 10).ok, false);
  });

  test('短すぎる時間帯は弾く（シフトを入れられないため）', () => {
    assert.equal(validateBusinessHours(10, 11).ok, false);
    assert.deepEqual(validateBusinessHours(10, 12), { ok: true });
  });

  test('24時を超える指定は弾く（日またぎは扱わない）', () => {
    assert.equal(validateBusinessHours(20, 26).ok, false);
    assert.equal(validateBusinessHours(20, 25).ok, false);
  });

  test('小数・NaN は弾く', () => {
    assert.equal(validateBusinessHours(8.5, 22).ok, false);
    assert.equal(validateBusinessHours(Number.NaN, 22).ok, false);
  });
});

describe('受付時間帯の読み書き', () => {
  test('書いたものが読み戻せる', () => {
    const hours = { startHour: 6, endHour: 24 };
    assert.deepEqual(parseBusinessHours(serializeBusinessHours(hours)), hours);
  });

  test('未設定は既定値（8:00〜22:00）', () => {
    assert.deepEqual(parseBusinessHours(null), DEFAULT_BUSINESS_HOURS);
    assert.deepEqual(parseBusinessHours(''), DEFAULT_BUSINESS_HOURS);
    assert.deepEqual(parseBusinessHours(undefined), DEFAULT_BUSINESS_HOURS);
  });

  test('壊れていても既定値で動く（画面を止めない）', () => {
    for (const bad of ['{', 'null', '[]', '"8-22"', '{"startHour":"あ"}', '{"startHour":22,"endHour":8}']) {
      assert.deepEqual(parseBusinessHours(bad), DEFAULT_BUSINESS_HOURS, `既定に落ちていない: ${bad}`);
    }
  });

  test('範囲外の値が保存されていても既定値に落とす', () => {
    assert.deepEqual(parseBusinessHours('{"startHour":20,"endHour":30}'), DEFAULT_BUSINESS_HOURS);
  });

  test('表示用の文字列は0埋めする', () => {
    assert.equal(formatBusinessHours({ startHour: 6, endHour: 24 }), '06:00〜24:00');
  });
});

describe('時間帯を狭めたときのはみ出し', () => {
  const shifts = [
    { start_time: '09:00', end_time: '17:00', shift_type: 'A' },
    { start_time: '07:00', end_time: '12:00', shift_type: 'B' }, // 8時より前
    { start_time: '18:00', end_time: '23:00', shift_type: 'C' }, // 22時より後
    { start_time: '00:00', end_time: '00:00', shift_type: 'off' }, // 休みは対象外
  ];

  test('新しい時間帯からはみ出す件数を数える', () => {
    assert.equal(countOutOfRange(shifts, { startHour: 8, endHour: 22 }), 2);
  });

  test('広げればはみ出しは無くなる', () => {
    assert.equal(countOutOfRange(shifts, { startHour: 6, endHour: 24 }), 0);
  });

  test('「休み」は時刻を持たないので数えない', () => {
    assert.equal(countOutOfRange([{ start_time: '00:00', end_time: '00:00', shift_type: 'off' }],
      { startHour: 8, endHour: 22 }), 0);
  });

  test('時刻が壊れている行で落ちない', () => {
    assert.equal(countOutOfRange([{ start_time: '', end_time: '', shift_type: 'A' }],
      { startHour: 8, endHour: 22 }), 0);
  });
});
