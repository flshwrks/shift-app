import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  netWorkMinutes, formatTotalHours, monthStart, monthEnd, formatYM,
  formatDate, getDaysInMonth, getDayLabel, timeToMinutes, minutesToTime,
  generateTimeSlots, isWeekend,
} from '../lib/shifts';

describe('netWorkMinutes（実働時間 = 拘束時間 − 休憩）', () => {
  // 労基法の休憩ルール（6時間超で45分、8時間超で60分）をそのまま実装している。
  // 給与計算の根拠になるため、境界値を固定しておく。
  test('6時間ちょうどは休憩を引かない', () => {
    assert.equal(netWorkMinutes('09:00', '15:00'), 360);
  });
  test('6時間を1分でも超えると45分引く', () => {
    assert.equal(netWorkMinutes('09:00', '15:01'), 361 - 45);
  });
  test('8時間ちょうどは45分引く', () => {
    assert.equal(netWorkMinutes('09:00', '17:00'), 480 - 45);
  });
  test('8時間を1分でも超えると60分引く', () => {
    assert.equal(netWorkMinutes('09:00', '17:01'), 481 - 60);
  });
  test('開始と終了が同じなら0', () => {
    assert.equal(netWorkMinutes('09:00', '09:00'), 0);
  });
  test('終了が開始より前でもマイナスにはしない', () => {
    assert.equal(netWorkMinutes('17:00', '09:00'), 0);
  });
});

describe('formatTotalHours', () => {
  test('0分はハイフン（未入力と同じ見え方にする）', () => {
    assert.equal(formatTotalHours(0), '-');
  });
  test('ちょうどの時間は分を出さない', () => {
    assert.equal(formatTotalHours(60), '1h');
  });
  test('端数があれば分まで出す', () => {
    assert.equal(formatTotalHours(435), '7h15m');
  });
});

describe('月の範囲（month は 0 始まり）', () => {
  test('平年の2月は28日まで', () => {
    assert.equal(monthEnd(2026, 1), '2026-02-28');
  });
  test('うるう年の2月は29日まで', () => {
    assert.equal(monthEnd(2028, 1), '2028-02-29');
  });
  test('12月は年をまたがない', () => {
    assert.equal(monthStart(2026, 11), '2026-12-01');
    assert.equal(monthEnd(2026, 11), '2026-12-31');
  });
  test('formatYM は月を1始まりでゼロ埋めする', () => {
    assert.equal(formatYM(2026, 0), '2026-01');
    assert.equal(formatYM(2026, 9), '2026-10');
  });
  test('getDaysInMonth はその月の日数ぶんだけ返し、月をまたがない', () => {
    const days = getDaysInMonth(2026, 1);
    assert.equal(days.length, 28);
    assert.equal(formatDate(days[0]), '2026-02-01');
    assert.equal(formatDate(days[days.length - 1]), '2026-02-28');
  });
});

describe('日付・時刻の変換', () => {
  test('formatDate はゼロ埋めする', () => {
    assert.equal(formatDate(new Date(2026, 0, 5)), '2026-01-05');
  });
  test('getDayLabel は曜日を日本語で付ける', () => {
    assert.equal(getDayLabel(new Date(2026, 0, 1)), '1日(木)');
  });
  test('timeToMinutes と minutesToTime は往復する', () => {
    assert.equal(timeToMinutes('09:30'), 570);
    assert.equal(minutesToTime(570), '09:30');
    assert.equal(minutesToTime(timeToMinutes('22:00')), '22:00');
  });
  test('isWeekend は土日だけ true', () => {
    assert.equal(isWeekend(new Date(2026, 0, 3)), true);  // 土
    assert.equal(isWeekend(new Date(2026, 0, 4)), true);  // 日
    assert.equal(isWeekend(new Date(2026, 0, 5)), false); // 月
  });
});

describe('generateTimeSlots', () => {
  test('8:00〜22:00を30分刻みで返し、22:30は作らない', () => {
    const slots = generateTimeSlots();
    assert.equal(slots[0], '08:00');
    assert.equal(slots[slots.length - 1], '22:00');
    assert.equal(slots.includes('22:30'), false);
    assert.equal(slots.length, 29);
  });
});
