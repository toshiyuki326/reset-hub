create or replace function public.bootstrap_current_user(p_display_name text default null)
returns table(profile_id uuid,member_id uuid,community_id uuid,role public.member_role,active boolean)
language plpgsql security definer set search_path=public as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email',''));
  v_profile uuid;
  v_inv public.community_invitations%rowtype;
begin
  if auth.uid() is null or v_email='' then
    raise exception 'authentication required' using errcode='42501';
  end if;
  select ci.* into v_inv
    from public.community_invitations as ci
   where lower(ci.email)=v_email and ci.accepted_at is null and ci.expires_at>now()
   order by ci.created_at limit 1 for update;
  select p.id into v_profile from public.profiles as p where p.auth_user_id=auth.uid();
  if v_profile is null and v_inv.id is not null then
    insert into public.profiles(auth_user_id,display_name)
    values(auth.uid(),coalesce(nullif(trim(p_display_name),''),split_part(v_email,'@',1)))
    returning id into v_profile;
  end if;
  if v_profile is not null and v_inv.id is not null then
    insert into public.community_members(community_id,profile_id,role,active)
    values(v_inv.community_id,v_profile,v_inv.role,true)
    on conflict on constraint community_members_community_id_profile_id_key do nothing;
    update public.community_invitations as ci set accepted_at=now() where ci.id=v_inv.id;
  end if;
  return query
  select p.id,cm.id,cm.community_id,cm.role,cm.active
    from public.profiles as p join public.community_members as cm on cm.profile_id=p.id
   where p.auth_user_id=auth.uid() and cm.active
   order by cm.created_at limit 1;
end$$;
revoke all on function public.bootstrap_current_user(text) from public,anon;
grant execute on function public.bootstrap_current_user(text) to authenticated;
