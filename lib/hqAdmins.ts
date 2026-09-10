/**
 * 本部管理者アカウントを増減させるときの歯止め。
 *
 * 本部管理者はどの店舗にも属さず、全店舗を横断して扱える唯一の役割。
 * ここを空にすると**誰も本部管理画面に入れなくなり、店舗の追加も権限の発行も
 * できなくなる**。復旧にはデータベースを直接触るしかないため、
 * UIから起こせないように2つの歯止めを置く。
 *
 * 判定はAPIの内側で行うが、条件だけをここに出してテストできるようにしている。
 * ここはDBにもenvにも触れない純粋な判定だけに保つこと（テストを軽く保つため）。
 */

import type { UserRole } from './types';

export type HqAdminGuardResult = { ok: true } | { ok: false; reason: string };

/**
 * 本部管理者を削除してよいか。
 * @param targetId  消そうとしている本部管理者のID
 * @param selfId    操作している本人のID
 * @param totalCount 現在の本部管理者の人数（対象を含む）
 */
export function canDeleteHqAdmin(
  targetId: string,
  selfId: string,
  totalCount: number,
): HqAdminGuardResult {
  // 自分を消すと、その場でログイン状態が切れて操作の途中で締め出される
  if (targetId === selfId) {
    return { ok: false, reason: '自分自身は削除できません。他の本部管理者から削除してください' };
  }
  // 最後の1人を消すと、本部管理画面に誰も入れなくなる
  if (totalCount <= 1) {
    return { ok: false, reason: '本部管理者は1人以上必要です。先に別の本部管理者を追加してください' };
  }
  return { ok: true };
}

/**
 * 本部管理者の役割を降格してよいか。
 * 降格も「その人が本部管理者でなくなる」点では削除と同じ結果になる。
 */
export function canDemoteHqAdmin(
  targetId: string,
  selfId: string,
  totalCount: number,
): HqAdminGuardResult {
  if (targetId === selfId) {
    return { ok: false, reason: '自分自身の権限は変更できません' };
  }
  if (totalCount <= 1) {
    return { ok: false, reason: '本部管理者は1人以上必要です' };
  }
  return { ok: true };
}

export const HQ_PIN_PATTERN = /^\d{4}$/;

export function validateHqAdminInput(name: string, pin: string, pinRequired: boolean): HqAdminGuardResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, reason: '名前を入力してください' };
  if (trimmed.length > 20) return { ok: false, reason: '名前は20文字以内で入力してください' };
  if (pinRequired || pin) {
    if (!HQ_PIN_PATTERN.test(pin)) return { ok: false, reason: 'PINは数字4桁で入力してください' };
  }
  return { ok: true };
}

/**
 * 再認証で入力してもらう「自分の合言葉」の形式チェック。
 *
 * developer はDBに行が無く、ログインにも4桁PINではなく DEV_LOGIN_PASSWORD を
 * 使う合成ロールなので、桁数の条件を分ける（照合の実体は lib/reauth.ts）。
 */
export function validateSelfSecret(role: UserRole, secret: string): HqAdminGuardResult {
  if (role === 'developer') {
    if (!secret) return { ok: false, reason: '確認のため、開発者パスワードを入力してください' };
    return { ok: true };
  }
  if (!HQ_PIN_PATTERN.test(secret)) {
    return { ok: false, reason: '確認のため、あなたのPINを数字4桁で入力してください' };
  }
  return { ok: true };
}

/**
 * 店舗スタッフ管理API（`/api/admin/users`）で操作してよい対象かどうか。
 *
 * あのAPIは「店舗に属する人」を扱う入口で、店舗境界の検査を hqロールに対しては
 * 省略する。省略してよいのは**店舗をまたげる**という意味であって、
 * **本部管理者そのものを操作してよい**という意味ではない。
 * 2026-09-11の点検(SEC-1)まで両者が混ざっており、本部管理者が古いこの入口から
 * 他の本部管理者を削除・降格でき、`/api/hq/admins` 側の歯止め
 * （再認証・自分は消せない・最後の1人は消せない）を素通りできた。
 *
 * 判定自体は1行だが、**抜けても画面上は何も壊れない**種類の不変条件なので、
 * ここに出してテストで固定する。
 */
export function isStoreScopedTarget(targetRole: string): boolean {
  return targetRole !== 'hq_admin';
}
