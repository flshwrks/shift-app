/**
 * 店舗ID(slug)の形式と、推測されないためのランダム接尾辞。
 *
 * slug は `/s/[storeSlug]/login` と `/s/[storeSlug]/public/schedule` の
 * URLに現れる。公開シフト表はログイン不要で見られる設計なので、
 * **slug が推測できると、部外者にスタッフの氏名と勤務予定が見える**。
 * 点検項目 F-6。
 *
 * 「ログインなしで見られる」利便性は現場で強く使われているため残す。
 * 代わりに slug 自体を推測できなくして、URLを知っている人だけが
 * たどり着ける状態にする。QRコード・ブックマーク運用なので、
 * slug が長くなっても現場の使い勝手は変わらない。
 *
 * 店舗の作成時にサーバー側で必ず付ける（画面側の実装に依存させない）。
 */

// 紛らわしい文字（l/1、o/0）を除いた32文字。読み上げ・手入力の事故を避ける。
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export const SUFFIX_LENGTH = 6;
export const MAX_SLUG_LENGTH = 40;
/** 接尾辞とハイフンの分を差し引いた、利用者が入力できる長さ */
export const MAX_BASE_LENGTH = MAX_SLUG_LENGTH - SUFFIX_LENGTH - 1;

// 半角英小文字・数字・ハイフンで3〜40文字、先頭末尾はハイフン不可
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const SLUG_ERROR =
  `店舗IDは英小文字・数字・ハイフンで3文字以上${MAX_BASE_LENGTH}文字以下で入力してください`;

/** 32^6 ≒ 10億通り。総当たりはVercel側のレート制限で現実的でない */
export function randomSuffix(): string {
  const bytes = new Uint8Array(SUFFIX_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * 入力された店舗IDにランダムな接尾辞を付ける。
 * 全体が40文字を超えないよう、必要なら入力側を切り詰める
 * （切り詰めで末尾がハイフンになる場合は取り除く）。
 */
export function withRandomSuffix(base: string, suffix: string = randomSuffix()): string {
  let head = base.slice(0, MAX_BASE_LENGTH);
  while (head.endsWith('-')) head = head.slice(0, -1);
  return `${head}-${suffix}`;
}

/** すでにランダム接尾辞が付いている形か（既存店舗の点検に使う） */
export function hasRandomSuffix(slug: string): boolean {
  const m = slug.match(/-([a-z0-9]+)$/);
  if (!m || m[1].length !== SUFFIX_LENGTH) return false;
  return [...m[1]].every(c => ALPHABET.includes(c));
}
