-- シフト管理アプリ Supabase スキーマ

-- ユーザーテーブル
create table if not exists public.users (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,
  pin_hash text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz default now()
);

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

-- RLS を有効化（オープンポリシー: アプリ側で認証を管理）
alter table public.users enable row level security;
alter table public.shifts enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "allow_all_users" on public.users;
drop policy if exists "allow_all_shifts" on public.shifts;
drop policy if exists "allow_all_settings" on public.app_settings;

create policy "allow_all_users" on public.users for all using (true) with check (true);
create policy "allow_all_shifts" on public.shifts for all using (true) with check (true);
create policy "allow_all_settings" on public.app_settings for all using (true) with check (true);

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
