import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PATTERNS, PATTERN_KEYS, parsePatterns, serializePatterns,
  enabledPatterns, findPattern, patternTitle, patternTimeRange,
  validatePatterns, isValidTime, type ShiftPattern,
} from '../lib/shiftPatterns';
import { SHIFT_PRESETS } from '../lib/types';

const clone = (): ShiftPattern[] => DEFAULT_PATTERNS.map(p => ({ ...p }));

describe('既定値', () => {
  test('A〜Gの7枠がそろい、従来の時間帯と一致する', () => {
    assert.equal(DEFAULT_PATTERNS.length, 7);
    for (const p of DEFAULT_PATTERNS) {
      assert.equal(p.start, SHIFT_PRESETS[p.key].start);
      assert.equal(p.end, SHIFT_PRESETS[p.key].end);
      assert.equal(p.enabled, true);
    }
  });
});

describe('parsePatterns：壊れた値でも止まらない', () => {
  test('未設定なら既定値', () => {
    assert.deepEqual(parsePatterns(null), clone());
    assert.deepEqual(parsePatterns(''), clone());
    assert.deepEqual(parsePatterns(undefined), clone());
  });

  test('JSONとして壊れていても既定値', () => {
    assert.deepEqual(parsePatterns('{壊れ'), clone());
    assert.deepEqual(parsePatterns('"文字列"'), clone());
    assert.deepEqual(parsePatterns('{"key":"A"}'), clone(), '配列でなければ既定値');
  });

  test('枠が欠けていれば、その枠だけ既定値で埋まる', () => {
    const got = parsePatterns(JSON.stringify([{ key: 'A', label: '早番', start: '07:00', end: '12:00', enabled: true }]));
    assert.equal(got.length, 7);
    assert.equal(got[0].start, '07:00');
    assert.equal(got[0].label, '早番');
    assert.equal(got[1].start, SHIFT_PRESETS.B.start, 'Bは既定値のまま');
  });

  test('不正な時刻はその枠だけ既定値に戻る', () => {
    const got = parsePatterns(JSON.stringify([{ key: 'A', start: '25:00', end: 'あ', enabled: true }]));
    assert.equal(got[0].start, SHIFT_PRESETS.A.start);
    assert.equal(got[0].end, SHIFT_PRESETS.A.end);
  });

  test('enabled は明示的な false のときだけ無効（未指定は有効）', () => {
    const got = parsePatterns(JSON.stringify([
      { key: 'A', enabled: false }, { key: 'B' }, { key: 'C', enabled: 'no' },
    ]));
    assert.equal(findPattern(got, 'A')!.enabled, false);
    assert.equal(findPattern(got, 'B')!.enabled, true);
    assert.equal(findPattern(got, 'C')!.enabled, true);
  });

  test('知らないキーは無視される', () => {
    const got = parsePatterns(JSON.stringify([{ key: 'Z', start: '01:00', end: '02:00' }]));
    assert.deepEqual(got.map(p => p.key), [...PATTERN_KEYS]);
  });

  test('表示名は12文字で切られる', () => {
    const got = parsePatterns(JSON.stringify([{ key: 'A', label: 'あ'.repeat(30) }]));
    assert.equal(got[0].label.length, 12);
  });
});

describe('保存と読み戻し', () => {
  test('往復しても内容が変わらない', () => {
    const src = clone();
    src[0] = { ...src[0], label: '早番', start: '07:30', end: '12:30', enabled: false };
    assert.deepEqual(parsePatterns(serializePatterns(src)), src);
  });

  test('保存時に表示名の前後の空白が落ちる', () => {
    const src = clone();
    src[0] = { ...src[0], label: '  早番  ' };
    assert.equal(parsePatterns(serializePatterns(src))[0].label, '早番');
  });
});

describe('選択肢の絞り込み', () => {
  test('無効な枠は選択肢に出ない', () => {
    const src = clone();
    src[3].enabled = false; src[4].enabled = false;
    src[5].enabled = false; src[6].enabled = false;
    assert.deepEqual(enabledPatterns(src).map(p => p.key), ['A', 'B', 'C']);
  });

  test('無効な枠でも findPattern では引ける（過去のシフトの表示に要る）', () => {
    const src = clone();
    src[6].enabled = false;
    assert.equal(findPattern(src, 'G')!.key, 'G');
  });

  test('存在しないキーは null', () => {
    assert.equal(findPattern(clone(), 'custom'), null);
  });
});

describe('表示', () => {
  test('表示名があれば「A 早番」、なければ「A」', () => {
    assert.equal(patternTitle({ key: 'A', label: '早番', start: '08:00', end: '13:00', enabled: true }), 'A 早番');
    assert.equal(patternTitle({ key: 'A', label: '   ', start: '08:00', end: '13:00', enabled: true }), 'A');
  });

  test('時間帯は先頭の0を落とす', () => {
    assert.equal(patternTimeRange({ key: 'A', label: '', start: '08:00', end: '13:00', enabled: true }), '8:00〜13:00');
  });
});

describe('保存前の検証', () => {
  test('既定値は通る', () => {
    assert.deepEqual(validatePatterns(clone()), []);
  });

  test('開始と終了が同じなら弾く', () => {
    const src = clone();
    src[0].end = src[0].start;
    assert.match(validatePatterns(src)[0], /開始と終了が同じ/);
  });

  test('終了が開始より前なら弾く（日またぎは未対応）', () => {
    const src = clone();
    src[0] = { ...src[0], start: '22:00', end: '02:00' };
    assert.match(validatePatterns(src)[0], /終了が開始より前/);
  });

  test('全部を無効にはできない', () => {
    const src = clone().map(p => ({ ...p, enabled: false }));
    assert.ok(validatePatterns(src).some(e => /少なくとも1つ/.test(e)));
  });

  test('時刻の形式が壊れていれば弾く', () => {
    const src = clone();
    src[0] = { ...src[0], start: '8:00' };
    assert.match(validatePatterns(src)[0], /形式/);
  });
});

describe('isValidTime', () => {
  test('HH:MM の24時間表記だけを通す', () => {
    for (const ok of ['00:00', '08:30', '23:59']) assert.ok(isValidTime(ok), ok);
    for (const ng of ['8:00', '24:00', '12:60', '', '1200', null, 12]) assert.ok(!isValidTime(ng), String(ng));
  });
});
