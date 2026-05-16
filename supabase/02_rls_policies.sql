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
