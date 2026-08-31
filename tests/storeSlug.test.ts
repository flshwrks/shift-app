import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withRandomSuffix, randomSuffix, hasRandomSuffix,
  SLUG_PATTERN, SUFFIX_LENGTH, MAX_SLUG_LENGTH, MAX_BASE_LENGTH,
} from '../lib/storeSlug';

test('入力した店舗IDは接尾辞の前にそのまま残る', () => {
  assert.equal(withRandomSuffix('umeda', 'k3f9q2'), 'umeda-k3f9q2');
});

test('接尾辞は既定の長さで、紛らわしい文字を含まない', () => {
  for (let i = 0; i < 200; i++) {
    const s = randomSuffix();
    assert.equal(s.length, SUFFIX_LENGTH);
    assert.match(s, /^[a-z0-9]+$/);
    assert.ok(!/[lo01]/.test(s), `紛らわしい文字が混じった: ${s}`);
  }
});

test('接尾辞は毎回変わる（同じ値が連続しない）', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(randomSuffix());
  assert.ok(seen.size > 190, `偏りが大きい: ${seen.size}/200`);
});

test('長い入力でも全体が上限を超えない', () => {
  const long = 'a'.repeat(100);
  const slug = withRandomSuffix(long, 'k3f9q2');
  assert.ok(slug.length <= MAX_SLUG_LENGTH, `長すぎる: ${slug.length}`);
  assert.equal(slug, `${'a'.repeat(MAX_BASE_LENGTH)}-k3f9q2`);
});

test('切り詰めで末尾がハイフンになってもハイフンが連続しない', () => {
  const base = 'a'.repeat(MAX_BASE_LENGTH - 1) + '-';
  const slug = withRandomSuffix(base, 'k3f9q2');
  assert.ok(!slug.includes('--'), slug);
  assert.match(slug, SLUG_PATTERN);
});

test('生成した店舗IDは必ず slug の形式を満たす', () => {
  for (const base of ['umeda', 'abc', 'a-b-c', '123', 'x'.repeat(MAX_BASE_LENGTH)]) {
    const slug = withRandomSuffix(base);
    assert.match(slug, SLUG_PATTERN, `形式違反: ${slug}`);
    assert.ok(slug.length <= MAX_SLUG_LENGTH);
  }
});

test('接尾辞の有無を判定できる（既存店舗の点検用）', () => {
  assert.ok(hasRandomSuffix('umeda-k3f9q2'));
  assert.ok(hasRandomSuffix(withRandomSuffix('honten')));
  assert.ok(!hasRandomSuffix('umeda'));
  assert.ok(!hasRandomSuffix('umeda-k3f9'), '6文字未満は接尾辞とみなさない');
  assert.ok(!hasRandomSuffix('umeda-k3f9q2x'), '6文字超は接尾辞とみなさない');
  assert.ok(!hasRandomSuffix('umeda-k3f9o0'), '除外文字を含むものは接尾辞とみなさない');
});
