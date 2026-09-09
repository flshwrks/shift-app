import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PATTERNS, PATTERN_KEYS, MAX_PATTERNS,
  NEW_PATTERN_START, NEW_PATTERN_END,
  parsePatterns, serializePatterns,
  addPattern, removePattern, movePattern, nextAvailableKey,
  findPattern, patternTitle, patternTimeRange,
  validatePatterns, isValidTime, type ShiftPattern,
} from '../lib/shiftPatterns';
import { SHIFT_PRESETS } from '../lib/types';

const clone = (): ShiftPattern[] => DEFAULT_PATTERNS.map(p => ({ ...p }));
const keys = (ps: ShiftPattern[]) => ps.map(p => p.key);

describe('既定値', () => {
  test('初期状態は A〜G の7件（H以降は追加したときだけ現れる）', () => {
    assert.deepEqual(keys(DEFAULT_PATTERNS), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    for (const p of DEFAULT_PATTERNS) {
      const def = SHIFT_PRESETS[p.key as keyof typeof SHIFT_PRESETS];
      assert.equal(p.start, def.start);
      assert.equal(p.end, def.end);
    }
  });

  test('使える記号は A〜L の12件。DBのCHECK制約と一致させること', () => {
    assert.equal(MAX_PATTERNS, 12);
    assert.deepEqual([...PATTERN_KEYS],
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
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

  test('保存された順序がそのまま復元される', () => {
    const raw = JSON.stringify([
      { key: 'C', label: '通し', start: '08:00', end: '17:00' },
      { key: 'A', label: '早番', start: '08:00', end: '13:00' },
    ]);
    assert.deepEqual(keys(parsePatterns(raw)), ['C', 'A']);
  });

  test('保存されていない記号は復元されない（削除が効く）', () => {
    const raw = JSON.stringify([{ key: 'A', label: '', start: '08:00', end: '13:00' }]);
    assert.deepEqual(keys(parsePatterns(raw)), ['A']);
  });

  test('不正な時刻はその件だけ既定値に戻る', () => {
    const raw = JSON.stringify([{ key: 'A', start: '25:00', end: 'あ' }]);
    const got = parsePatterns(raw);
    assert.equal(got[0].start, SHIFT_PRESETS.A.start);
    assert.equal(got[0].end, SHIFT_PRESETS.A.end);
  });

  test('追加した記号(H以降)も読み戻せる', () => {
    const raw = JSON.stringify([
      { key: 'A', label: '', start: '08:00', end: '13:00' },
      { key: 'H', label: '中番', start: '11:00', end: '20:00' },
    ]);
    const got = parsePatterns(raw);
    assert.deepEqual(keys(got), ['A', 'H']);
    assert.equal(got[1].label, '中番');
    assert.equal(got[1].start, '11:00');
  });

  test('H以降で時刻が壊れていれば追加時の既定値で補う', () => {
    const got = parsePatterns(JSON.stringify([{ key: 'H', start: 'x', end: 'y' }]));
    assert.equal(got[0].start, NEW_PATTERN_START);
    assert.equal(got[0].end, NEW_PATTERN_END);
  });

  test('知らない記号と重複は捨てる', () => {
    const raw = JSON.stringify([
      { key: 'Z', start: '01:00', end: '02:00' },
      { key: 'A', start: '08:00', end: '13:00' },
      { key: 'A', start: '09:00', end: '14:00' },
    ]);
    assert.deepEqual(keys(parsePatterns(raw)), ['A']);
  });

  test('1件も残らない指定なら既定値に戻す（画面が空にならないように）', () => {
    assert.deepEqual(parsePatterns('[]'), clone());
    assert.deepEqual(parsePatterns(JSON.stringify([{ key: 'Z' }])), clone());
  });

  test('表示名は12文字で切られる', () => {
    const got = parsePatterns(JSON.stringify([{ key: 'A', label: 'あ'.repeat(30) }]));
    assert.equal(got[0].label.length, 12);
  });

  test('旧形式（enabled付き）も読める。無効だったものは取り除かれる', () => {
    const raw = JSON.stringify([
      { key: 'A', label: '', start: '08:00', end: '13:00', enabled: true },
      { key: 'B', label: '', start: '09:00', end: '14:00', enabled: false },
      { key: 'C', label: '', start: '08:00', end: '17:00' },
    ]);
    assert.deepEqual(keys(parsePatterns(raw)), ['A', 'C']);
  });
});

describe('保存と読み戻し', () => {
  test('往復しても内容が変わらない', () => {
    const src = clone().slice(0, 3);
    src[0] = { ...src[0], label: '早番', start: '07:30', end: '12:30' };
    assert.deepEqual(parsePatterns(serializePatterns(src)), src);
  });

  test('保存時に表示名の前後の空白が落ちる', () => {
    const src = clone();
    src[0] = { ...src[0], label: '  早番  ' };
    assert.equal(parsePatterns(serializePatterns(src))[0].label, '早番');
  });
});

describe('増やす', () => {
  test('空いている記号のうち、いちばん若いものが割り当たる', () => {
    const src = [clone()[0], clone()[2]]; // A と C
    assert.equal(nextAvailableKey(src), 'B');
    assert.deepEqual(keys(addPattern(src)), ['A', 'C', 'B'], '末尾に足される');
  });

  test('追加した種別は既定の時間帯を持つ', () => {
    const added = addPattern([clone()[0]]);
    assert.equal(added[1].start, NEW_PATTERN_START);
    assert.equal(added[1].end, NEW_PATTERN_END);
    assert.equal(added[1].label, '');
  });

  test('既定の7件のあとは H から続く', () => {
    assert.equal(nextAvailableKey(clone()), 'H');
    assert.deepEqual(keys(addPattern(clone())).slice(-1), ['H']);
  });

  test('12件を超えては追加できない', () => {
    let full = clone();
    while (nextAvailableKey(full)) full = addPattern(full);
    assert.equal(full.length, MAX_PATTERNS);
    assert.deepEqual(keys(full).slice(-5), ['H', 'I', 'J', 'K', 'L']);
    assert.deepEqual(addPattern(full), full, '何も起きない');
  });
});

describe('減らす', () => {
  test('指定した記号だけが消える', () => {
    assert.deepEqual(keys(removePattern(clone(), 'C')), ['A', 'B', 'D', 'E', 'F', 'G']);
  });

  test('最後の1件は消せない', () => {
    const one = [clone()[0]];
    assert.deepEqual(removePattern(one, 'A'), one);
  });

  test('消した記号は再び追加できる（記号が再利用される）', () => {
    const removed = removePattern(clone(), 'B');
    assert.equal(nextAvailableKey(removed), 'B');
  });

  test('存在しない記号を指定しても壊れない', () => {
    assert.deepEqual(keys(removePattern(clone(), 'Z')), keys(clone()));
  });
});

describe('入れ替える', () => {
  test('ひとつ上へ動く', () => {
    assert.deepEqual(keys(movePattern(clone(), 'C', -1)), ['A', 'C', 'B', 'D', 'E', 'F', 'G']);
  });

  test('ひとつ下へ動く', () => {
    assert.deepEqual(keys(movePattern(clone(), 'A', 1)), ['B', 'A', 'C', 'D', 'E', 'F', 'G']);
  });

  test('端を越える指定は何もしない', () => {
    assert.deepEqual(keys(movePattern(clone(), 'A', -1)), keys(clone()));
    assert.deepEqual(keys(movePattern(clone(), 'G', 1)), keys(clone()));
  });

  test('並べ替えても記号と時間帯の対応は変わらない（過去のシフトが壊れない）', () => {
    const moved = movePattern(clone(), 'C', -1);
    assert.equal(findPattern(moved, 'C')!.start, SHIFT_PRESETS.C.start);
    assert.equal(findPattern(moved, 'B')!.start, SHIFT_PRESETS.B.start);
  });

  test('元の配列を書き換えない', () => {
    const src = clone();
    movePattern(src, 'C', -1);
    assert.deepEqual(keys(src), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });
});

describe('引く・表示する', () => {
  test('削除された記号は null（呼び出し側はシフト行の時刻を出す）', () => {
    assert.equal(findPattern(removePattern(clone(), 'G'), 'G'), null);
    assert.equal(findPattern(clone(), 'custom'), null);
  });

  test('表示名があれば「A 早番」、なければ「A」', () => {
    assert.equal(patternTitle({ key: 'A', label: '早番', start: '08:00', end: '13:00' }), 'A 早番');
    assert.equal(patternTitle({ key: 'A', label: '   ', start: '08:00', end: '13:00' }), 'A');
  });

  test('時間帯は先頭の0を落とす', () => {
    assert.equal(patternTimeRange({ key: 'A', label: '', start: '08:00', end: '13:00' }), '8:00〜13:00');
  });
});

describe('保存前の検証', () => {
  test('既定値は通る', () => {
    assert.deepEqual(validatePatterns(clone()), []);
  });

  test('空は弾く', () => {
    assert.match(validatePatterns([])[0], /1つ以上/);
  });

  test('開始と終了が同じなら弾く', () => {
    const src = clone();
    src[0] = { ...src[0], end: src[0].start };
    assert.match(validatePatterns(src)[0], /開始と終了が同じ/);
  });

  test('終了が開始より前なら弾く（日またぎは未対応）', () => {
    const src = clone();
    src[0] = { ...src[0], start: '22:00', end: '02:00' };
    assert.match(validatePatterns(src)[0], /終了が開始より前/);
  });

  test('表示名があればエラー文に出す', () => {
    const src = [{ key: 'A' as const, label: '早番', start: '10:00', end: '09:00' }];
    assert.match(validatePatterns(src)[0], /A（早番）/);
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
