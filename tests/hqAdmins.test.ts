import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteHqAdmin, canDemoteHqAdmin, validateHqAdminInput, validateSelfSecret, isStoreScopedTarget } from '../lib/hqAdmins';

describe('本部管理者の削除', () => {
  test('他の人が2人以上いれば削除できる', () => {
    assert.deepEqual(canDeleteHqAdmin('other', 'me', 2), { ok: true });
    assert.deepEqual(canDeleteHqAdmin('other', 'me', 5), { ok: true });
  });

  test('自分自身は削除できない', () => {
    const r = canDeleteHqAdmin('me', 'me', 3);
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.reason : '', /自分自身/);
  });

  test('最後の1人は削除できない（本部に誰も入れなくなるため）', () => {
    const r = canDeleteHqAdmin('other', 'me', 1);
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.reason : '', /1人以上/);
  });

  test('人数が0で渡っても弾く', () => {
    assert.equal(canDeleteHqAdmin('other', 'me', 0).ok, false);
  });

  test('自分かつ最後の1人は、自分自身の理由を優先して返す', () => {
    const r = canDeleteHqAdmin('me', 'me', 1);
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.reason : '', /自分自身/);
  });
});

describe('本部管理者の降格', () => {
  test('他の人が2人以上いれば降格できる', () => {
    assert.deepEqual(canDemoteHqAdmin('other', 'me', 2), { ok: true });
  });

  test('自分自身は降格できない', () => {
    assert.equal(canDemoteHqAdmin('me', 'me', 3).ok, false);
  });

  test('最後の1人は降格できない', () => {
    assert.equal(canDemoteHqAdmin('other', 'me', 1).ok, false);
  });
});

describe('入力の検証', () => {
  test('追加時は名前とPINの両方が要る', () => {
    assert.deepEqual(validateHqAdminInput('山田', '1234', true), { ok: true });
    assert.equal(validateHqAdminInput('', '1234', true).ok, false);
    assert.equal(validateHqAdminInput('山田', '', true).ok, false);
  });

  test('編集時はPINが空でもよい（変更しない意味）', () => {
    assert.deepEqual(validateHqAdminInput('山田', '', false), { ok: true });
  });

  test('編集時でもPINを入れたなら形式を見る', () => {
    const r = validateHqAdminInput('山田', '12', false);
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.reason : '', /4桁/);
  });

  test('PINは数字4桁だけ通す', () => {
    for (const ng of ['123', '12345', 'abcd', '12a4', '１２３４']) {
      assert.equal(validateHqAdminInput('山田', ng, true).ok, false, ng);
    }
  });

  test('名前は前後の空白を除いて判定し、20文字を超えたら弾く', () => {
    assert.equal(validateHqAdminInput('   ', '1234', true).ok, false, '空白だけは名前なし');
    assert.deepEqual(validateHqAdminInput('あ'.repeat(20), '1234', true), { ok: true });
    assert.equal(validateHqAdminInput('あ'.repeat(21), '1234', true).ok, false);
  });
});

// 再認証（追加・削除・PINの再発行の直前に本人確認を求める）の入力チェック。
// 照合そのものは lib/reauth.ts がDBと環境変数に触るため、ここでは形式だけを見る
describe('再認証の入力チェック', () => {
  test('本部管理者は自分のPINを数字4桁で入れる', () => {
    assert.deepEqual(validateSelfSecret('hq_admin', '1234'), { ok: true });
  });

  test('空・桁数違い・数字以外は弾く', () => {
    for (const bad of ['', '123', '12345', '12a4', ' 1234']) {
      assert.equal(validateSelfSecret('hq_admin', bad).ok, false, `弾けていない: ${JSON.stringify(bad)}`);
    }
  });

  test('developer は4桁ではなく開発者パスワードなので桁数で縛らない', () => {
    assert.deepEqual(validateSelfSecret('developer', 'a'.repeat(32)), { ok: true });
    assert.deepEqual(validateSelfSecret('developer', '1234'), { ok: true });
  });

  test('developer でも空欄は弾く', () => {
    assert.equal(validateSelfSecret('developer', '').ok, false);
  });

  test('弾いたときは何を入れるべきかが文面から分かる', () => {
    const hq = validateSelfSecret('hq_admin', '');
    assert.match(hq.ok === false ? hq.reason : '', /あなたのPIN/);
    const dev = validateSelfSecret('developer', '');
    assert.match(dev.ok === false ? dev.reason : '', /開発者パスワード/);
  });
});

// 店舗スタッフ管理API（/api/admin/users）が本部管理者を操作できてしまった穴（SEC-1）の再発防止。
// 判定は1行だが、抜けても画面上は何も壊れないので、ここで固定しておく
describe('店舗スタッフ管理APIの操作対象', () => {
  test('店舗に属するロールは操作してよい', () => {
    assert.equal(isStoreScopedTarget('staff'), true);
    assert.equal(isStoreScopedTarget('admin'), true);
  });

  test('本部管理者は操作させない（/api/hq/admins 側の歯止めを素通りさせないため）', () => {
    assert.equal(isStoreScopedTarget('hq_admin'), false);
  });

  test('未知のロールが増えても、hq_admin 以外は通す既定でよい', () => {
    // developer はDBに保存されないので users 行の role に現れない
    assert.equal(isStoreScopedTarget('developer'), true);
    assert.equal(isStoreScopedTarget(''), true);
  });
});
