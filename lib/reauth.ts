import { supabase } from './supabase';
import { constantTimeEqual } from './session';
import { validateSelfSecret } from './hqAdmins';
import type { SessionUser } from './types';

// ============================================================================
// 再認証 — 「いま操作しているのが本当に本人か」を、操作の直前にもう一度確かめる。
//
// 本部管理者は全店舗のデータを扱えるうえ、**別の本部管理者を増やせる**。
// 一方でセッションCookieの有効期限は30日ある。この対応（2026-09-11）まで、
// ログインしたままの端末を触れる人は誰でも、
//   - 自分だけが知るPINで新しい本部管理者を作る
//   - 既存の本部管理者のPINを自分の知る値に付け替える
// ことができ、**あとから消えない侵入経路を残せる**状態だった。
// 権限の強い操作の前に本人確認を挟むことでこれを塞ぐ。
//
// 名前の変更だけは対象外にしている。取り返しがつくうえ、
// 毎回PINを求めると「とりあえず入力する」癖がついて確認の意味が薄れるため。
//
// 失敗は verify_login 側の5回ロック（15分）にそのまま乗る。この経路から
// 総当たりを試しても、ログイン画面から試したときと同じ壁に当たる。
// 逆に、5回間違えると**その本部管理者自身がログインできなくなる**点に注意
// （復旧は15分待つか、別の本部管理者からPINを再発行する）。
// ============================================================================

/** 開発者パスワードの最低文字数。短い値は設定ミスとして拒否する（app/api/dev-login も同じ値を使う） */
export const DEV_SECRET_MIN_LENGTH = 24;

/** 失敗時に総当たりの試行速度を落とす。DB側のロックが無い developer 経路にだけ効かせる */
const FAILURE_DELAY_MS = 700;

export type ReauthResult = { ok: true } | { ok: false; status: number; reason: string };

/**
 * 操作している本人の合言葉を照合する。
 *
 * - developer … DBに行が無い合成ロールなので、ログイン時と同じ `DEV_LOGIN_PASSWORD` で照合する
 * - それ以外 … ログイン画面と同じ `verify_login`（bcrypt照合＋5回ロック）に通す
 *
 * @param session requireHqAdmin() 等が返した、DBと突き合わせ済みのセッション
 * @param secret  利用者が入力し直した自分のPIN（developer は開発者パスワード）
 */
export async function verifySelfSecret(session: SessionUser, secret: string): Promise<ReauthResult> {
  const valid = validateSelfSecret(session.role, secret);
  if (!valid.ok) return { ok: false, status: 400, reason: valid.reason };

  if (session.role === 'developer') {
    const expected = process.env.DEV_LOGIN_PASSWORD;
    // 未設定・短すぎる場合は開くより閉じる（app/api/dev-login と同じ判断）
    if (!expected || expected.length < DEV_SECRET_MIN_LENGTH) {
      console.warn('[reauth] DEV_LOGIN_PASSWORD が未設定または短すぎるため拒否した');
      return { ok: false, status: 503, reason: '開発者パスワードが設定されていません' };
    }
    if (!constantTimeEqual(secret, expected)) {
      console.warn('[reauth] 開発者パスワードの再確認に失敗した');
      await new Promise(r => setTimeout(r, FAILURE_DELAY_MS));
      return { ok: false, status: 401, reason: '開発者パスワードが違います' };
    }
    return { ok: true };
  }

  const { data, error } = await supabase
    .rpc('verify_login', { p_user_id: session.id, p_pin: secret })
    .maybeSingle<{ id: string }>();

  if (error) {
    // ロックアウト等、verify_login 側が raise exception したケース。
    // メッセージに残り時間の案内が入っているのでそのまま見せる
    console.warn(`[reauth] 再確認が拒否された user=${session.id}: ${error.message}`);
    return { ok: false, status: 429, reason: error.message };
  }
  if (!data) {
    // 失敗回数は verify_login 側で加算済み。5回でロックがかかる
    console.warn(`[reauth] PINの再確認に失敗した user=${session.id}`);
    return { ok: false, status: 401, reason: 'PINが違います' };
  }
  return { ok: true };
}
