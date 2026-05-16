create extension if not exists pgcrypto;

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
  kind text not null check (kind in ('母乳亲喂', '瓶喂母乳', '配方奶', '吸奶')),
  side text check (side in ('左侧', '右侧', '双侧')),
  started_side text check (started_side in ('左侧', '右侧')),
  left_minutes integer check (left_minutes >= 0),
  right_minutes integer check (right_minutes >= 0),
  total_minutes integer check (total_minutes >= 0),
  amount_ml integer check (amount_ml >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.diaper_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  kind text not null check (kind in ('尿尿', '便便', '尿尿+便便', '干爽')),
  stool_color text check (stool_color in ('黄色', '绿色', '黑色', '棕色', '其他')),
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

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.deleted_at is null
  );
$$;

alter table public.users enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.babies enable row level security;
alter table public.events enable row level security;
alter table public.feeding_details enable row level security;
alter table public.diaper_details enable row level security;
alter table public.sleep_details enable row level security;
alter table public.notes enable row level security;

create policy "users can read family users" on public.users
for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.family_members mine
    join public.family_members theirs on theirs.family_id = mine.family_id
    where mine.user_id = auth.uid()
      and theirs.user_id = users.id
      and mine.deleted_at is null
      and theirs.deleted_at is null
  )
);

create policy "users update self" on public.users
for update using (id = auth.uid()) with check (id = auth.uid());

create policy "users insert self" on public.users
for insert with check (id = auth.uid());

create policy "members read families" on public.families
for select using (public.is_family_member(id) and deleted_at is null);

create policy "authenticated users create families" on public.families
for insert with check (created_by = auth.uid());

create policy "members update families" on public.families
for update using (public.is_family_member(id)) with check (public.is_family_member(id));

create policy "members read family_members" on public.family_members
for select using (public.is_family_member(family_id) and deleted_at is null);

create policy "users join or create own membership" on public.family_members
for insert with check (user_id = auth.uid());

create policy "members update own membership" on public.family_members
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members read babies" on public.babies
for select using (public.is_family_member(family_id) and deleted_at is null);

create policy "members write babies" on public.babies
for all using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

create policy "members read events" on public.events
for select using (public.is_family_member(family_id) and deleted_at is null);

create policy "members write events" on public.events
for all using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

create policy "members read feeding details" on public.feeding_details
for select using (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id) and e.deleted_at is null));

create policy "members write feeding details" on public.feeding_details
for all using (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id)))
with check (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id)));

create policy "members read diaper details" on public.diaper_details
for select using (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id) and e.deleted_at is null));

create policy "members write diaper details" on public.diaper_details
for all using (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id)))
with check (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id)));

create policy "members read sleep details" on public.sleep_details
for select using (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id) and e.deleted_at is null));

create policy "members write sleep details" on public.sleep_details
for all using (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id)))
with check (exists (select 1 from public.events e where e.id = event_id and public.is_family_member(e.family_id)));

create policy "members read notes" on public.notes
for select using (public.is_family_member(family_id) and deleted_at is null);

create policy "members write notes" on public.notes
for all using (public.is_family_member(family_id)) with check (public.is_family_member(family_id));

create or replace function public.join_family_by_invite(
  code text,
  member_role public.family_role,
  member_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_family_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into target_family_id
  from public.families
  where invite_code = upper(code)
    and deleted_at is null
  limit 1;

  if target_family_id is null then
    raise exception 'invite code not found';
  end if;

  insert into public.family_members (family_id, user_id, role, display_name)
  values (target_family_id, auth.uid(), member_role, coalesce(nullif(member_name, ''), '家庭成员'))
  on conflict (family_id, user_id)
  do update set
    role = excluded.role,
    display_name = excluded.display_name,
    deleted_at = null,
    updated_at = now();

  return target_family_id;
end;
$$;
