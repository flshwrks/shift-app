-- ============================================================
-- シフト種別の枠を A〜G（7件）から A〜L（12件）へ広げる
--
-- 背景:
--   2026-09-09 に「シフト種別を店舗ごとに追加・削除・並べ替えできる」機能を入れたが、
--   記号が A〜G の7件しか無く、それ以上増やせなかった。
--   記号は shifts.shift_type / shift_requests.shift_type に保存される値そのもので、
--   CHECK制約で列挙しているため、ここを広げないとアプリ側だけでは増やせない。
--
-- なぜ12件か:
--   DBの都合ではなく、**色を見分けられる上限**で決めている。
--   一覧では記号ごとに色を付けており、これ以上増やすと隣り合う色の区別がつかない。
--   さらに必要になった場合は、記号を増やすより「表示名で区別する」運用のほうがよい。
--
-- 安全性:
--   既存の値（A〜G / custom / off）は引き続き許可されるため、**既存データは影響を受けない**。
--   許可する値を増やすだけの後方互換な変更で、行の書き換えも起きない。
--
-- ★適用順序: このマイグレーションを先に適用し、そのあとでアプリを配信すること。
--   逆にするとアプリが H 以降の種別を保存しようとして CHECK 違反になる。
--   （docs/OPERATIONS.md §7「DBを変更する手順」）
-- ============================================================

-- 実行前の確認（既存の制約定義を目視する）
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid in ('public.shifts'::regclass, 'public.shift_requests'::regclass)
--     and contype = 'c' and conname like '%shift_type%';

do $$
begin
  -- ---------------------------------------------------------
  -- shifts: 実績のシフト。off（休み）を含む
  -- ---------------------------------------------------------
  alter table public.shifts drop constraint if exists shifts_shift_type_check;
  alter table public.shifts add constraint shifts_shift_type_check
    check (shift_type in (
      'A','B','C','D','E','F','G','H','I','J','K','L','custom','off'
    ));
  raise notice 'shifts_shift_type_check を A〜L に更新しました';

  -- ---------------------------------------------------------
  -- shift_requests: 交代の募集。休みの募集は無いので off を含めない
  -- （元の定義に合わせている。ここに off を足すと募集の意味が変わる）
  -- ---------------------------------------------------------
  alter table public.shift_requests drop constraint if exists shift_requests_shift_type_check;
  alter table public.shift_requests add constraint shift_requests_shift_type_check
    check (shift_type in (
      'A','B','C','D','E','F','G','H','I','J','K','L','custom'
    ));
  raise notice 'shift_requests_shift_type_check を A〜L に更新しました';
end $$;

-- 実行後の確認（A〜L と custom/off が入っていること）
select conrelid::regclass as "テーブル",
       conname            as "制約名",
       pg_get_constraintdef(oid) as "定義"
from pg_constraint
where conrelid in ('public.shifts'::regclass, 'public.shift_requests'::regclass)
  and contype = 'c'
  and conname like '%shift_type%'
order by 1;
