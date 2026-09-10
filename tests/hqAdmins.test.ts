import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canDeleteHqAdmin, canDemoteHqAdmin, validateHqAdminInput } from '../lib/hqAdmins';

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
