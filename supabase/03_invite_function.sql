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
