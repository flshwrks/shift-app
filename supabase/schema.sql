-- シフト管理アプリ Supabase スキーマ
--
-- 注意: このファイルは「ゼロから新規構築する場合」のベースライン定義です。
-- 既存環境（このファイルより前に作成済みのプロジェクト）には
-- supabase/migrations/2026-07-25_security_hardening.sql を別途適用してください。
-- 詳細な経緯・残存リスクは docs/SECURITY.md を参照。

-- pgcrypto（bcryptによるPINハッシュ化に使用）
create extension if not exists pgcrypto;

-- ユーザーテーブル
create table if not exists public.users (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  pin_hash text,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  display_order int,
  failed_pin_attempts int not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz default now()
);
-- role='developer' はDBには保存されない、クライアント限定の合成ロール（app/api/dev-login 経由）

-- シフトテーブル
create table if not exists public.shifts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  shift_type text not null check (shift_type in ('A','B','C','D','E','F','G','custom','off')),
  start_time text not null,
  end_time text not null,
  comment text default '',
  status text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, date)
);

-- アプリ設定テーブル
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- デフォルト設定を挿入
insert into public.app_settings (key, value)
values ('deadline', '')
on conflict (key) do nothing;

-- RLS を有効化
-- users 以外は引き続きオープンポリシー（アプリ側で認証を管理。残存リスクは docs/SECURITY.md 参照）
alter table public.users enable row level security;
alter table public.shifts enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "allow_all_users" on public.users;
drop policy if exists "allow_all_shifts" on public.shifts;
drop policy if exists "allow_all_settings" on public.app_settings;

-- users: 行の可視性(RLS)は全開放のままだが、列単位の権限で pin_hash 等の機微列だけを隠す
-- （PIN検証・設定は verify_login / admin_set_pin の SECURITY DEFINER RPC 経由に限定）
create policy "allow_all_users" on public.users for all using (true) with check (true);
create policy "allow_all_shifts" on public.shifts for all using (true) with check (true);
create policy "allow_all_settings" on public.app_settings for all using (true) with check (true);

revoke select on public.users from anon, authenticated;
grant select (id, name, role, display_order, created_at) on public.users to anon, authenticated;

-- PIN検証RPC（bcrypt比較 + 失敗ロックアウト。詳細は migrations/2026-07-25_security_hardening.sql）
create or replace function public.verify_login(p_user_id uuid, p_pin text)
returns table(id uuid, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.users%rowtype;
begin
  select * into v_user from public.users u where u.id = p_user_id;
  if not found then
    return;
  end if;
  if v_user.pin_locked_until is not null and v_user.pin_locked_until > now() then
    raise exception 'アカウントがロックされています。しばらくしてから再度お試しください。' using errcode = 'P0001';
  end if;
  if v_user.pin_hash = crypt(p_pin, v_user.pin_hash) then
    update public.users u set failed_pin_attempts = 0, pin_locked_until = null where u.id = p_user_id;
    return query select v_user.id, v_user.name, v_user.role;
  else
    update public.users u
      set failed_pin_attempts = u.failed_pin_attempts + 1,
          pin_locked_until = case when u.failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes' else u.pin_locked_until end
      where u.id = p_user_id;
    return;
  end if;
end;
$$;

grant execute on function public.verify_login(uuid, text) to anon, authenticated;

-- PIN設定RPC（スタッフ追加・編集・PINリセット時に使用）
create or replace function public.admin_set_pin(p_user_id uuid, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_pin !~ '^\d{4}$' then
    raise exception 'PINは数字4桁で指定してください' using errcode = 'P0001';
  end if;
  update public.users u
    set pin_hash = crypt(p_new_pin, gen_salt('bf', 10)), failed_pin_attempts = 0, pin_locked_until = null
    where u.id = p_user_id;
end;
$$;

grant execute on function public.admin_set_pin(uuid, text) to anon, authenticated;

-- リアルタイム設定
alter publication supabase_realtime add table public.shifts;
alter publication supabase_realtime add table public.users;
alter publication supabase_realtime add table public.app_settings;

-- updated_at を自動更新するトリガー
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger shifts_updated_at
  before update on public.shifts
  for each row execute function public.update_updated_at();

create trigger settings_updated_at
  before update on public.app_settings
  for each row execute function public.update_updated_at();

-- サンプルデータ（管理者アカウント）
-- PIN: 1234 のハッシュ（SHA-256 with salt "shift_app_salt"）
-- 実際のハッシュはアプリ側で生成してください
-- insert into public.users (name, pin_hash, role) values ('管理者', '<hash>', 'admin');

-- シフト調整依頼テーブル
create table if not exists public.shift_requests (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  start_time text not null,
  end_time text not null,
  shift_type text check (shift_type in ('A','B','C','D','E','F','G','custom')),
  message text default '',
  request_type text not null default 'targeted' check (request_type in ('targeted', 'open')),
  created_by uuid references public.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'cancelled')),
  created_at timestamptz default now()
);

-- 依頼宛先テーブル（指名型用）
create table if not exists public.shift_request_targets (
  id uuid default gen_random_uuid() primary key,
  request_id uuid not null references public.shift_requests(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  responded_at timestamptz,
  unique(request_id, user_id)
);

alter table public.shift_requests enable row level security;
alter table public.shift_request_targets enable row level security;

drop policy if exists "allow_all_shift_requests" on public.shift_requests;
drop policy if exists "allow_all_shift_request_targets" on public.shift_request_targets;

create policy "allow_all_shift_requests" on public.shift_requests for all using (true) with check (true);
create policy "allow_all_shift_request_targets" on public.shift_request_targets for all using (true) with check (true);

alter publication supabase_realtime add table public.shift_requests;
alter publication supabase_realtime add table public.shift_request_targets;

-- アンケートテーブル
create table if not exists public.surveys (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_at timestamptz default now()
);

-- アンケート選択肢テーブル
create table if not exists public.survey_options (
  id uuid default gen_random_uuid() primary key,
  survey_id uuid not null references public.surveys(id) on delete cascade,
  label text not null,
  display_order int not null default 0,
  is_other boolean not null default false
);

-- アンケート回答テーブル
create table if not exists public.survey_responses (
  id uuid default gen_random_uuid() primary key,
  survey_id uuid not null references public.surveys(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  option_id uuid references public.survey_options(id) on delete set null,
  custom_text text default '',
  created_at timestamptz default now(),
  unique(survey_id, user_id)
);

alter table public.surveys enable row level security;
alter table public.survey_options enable row level security;
alter table public.survey_responses enable row level security;

drop policy if exists "allow_all_surveys" on public.surveys;
drop policy if exists "allow_all_survey_options" on public.survey_options;
drop policy if exists "allow_all_survey_responses" on public.survey_responses;

create policy "allow_all_surveys" on public.surveys for all using (true) with check (true);
create policy "allow_all_survey_options" on public.survey_options for all using (true) with check (true);
create policy "allow_all_survey_responses" on public.survey_responses for all using (true) with check (true);
