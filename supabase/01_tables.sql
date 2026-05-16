create extension if not exists pgcrypto;

drop table if exists public.notes cascade;
drop table if exists public.sleep_details cascade;
drop table if exists public.diaper_details cascade;
drop table if exists public.feeding_details cascade;
drop table if exists public.events cascade;
drop table if exists public.babies cascade;
drop table if exists public.family_members cascade;
drop table if exists public.families cascade;
drop table if exists public.users cascade;
drop type if exists public.event_type cascade;
drop type if exists public.baby_gender cascade;
drop type if exists public.family_role cascade;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type public.family_role as enum ('爸爸', '妈妈', '月嫂', '奶奶', '外婆', '其他');

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.family_role not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (family_id, user_id)
);

create type public.baby_gender as enum ('男宝', '女宝', '暂不设置');

create table public.babies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  nickname text not null,
  birth_at timestamptz not null,
  gender public.baby_gender not null default '暂不设置',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type public.event_type as enum ('feeding', 'diaper', 'sleep', 'burp', 'cry');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  baby_id uuid not null references public.babies(id) on delete cascade,
  type public.event_type not null,
  happened_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid not null references public.users(id),
  role public.family_role not null,
  note text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.feeding_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  kind text not null,
  side text,
  started_side text,
  left_minutes integer check (left_minutes >= 0),
  right_minutes integer check (right_minutes >= 0),
  total_minutes integer check (total_minutes >= 0),
  amount_ml integer check (amount_ml >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diaper_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  kind text not null,
  stool_color text,
  stool_state text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sleep_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  duration_minutes integer check (duration_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  content text not null,
  created_by uuid not null references public.users(id),
  role public.family_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index events_family_baby_happened_at_idx on public.events (family_id, baby_id, happened_at desc) where deleted_at is null;
create index family_members_user_idx on public.family_members (user_id) where deleted_at is null;
create index babies_family_idx on public.babies (family_id) where deleted_at is null;
