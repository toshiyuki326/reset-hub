-- Invitations exist before an auth.users row and are consumed only by the matching JWT email.
alter table public.events add column if not exists source_type text not null default 'manual' check(source_type in ('manual','line'));
alter table public.events add column if not exists source_id uuid references public.line_messages(id) on delete set null;
create table public.community_invitations(
  id uuid primary key default gen_random_uuid(), community_id uuid not null references public.communities on delete cascade,
  email text not null, role public.member_role not null default 'member', invited_by uuid references public.profiles,
  expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz, created_at timestamptz not null default now(),
  unique(community_id,email)
);
alter table public.community_invitations enable row level security;
create policy invitations_owner_read on public.community_invitations for select using(public.current_user_community_role(community_id)='owner');
create policy invitations_owner_write on public.community_invitations for all using(public.current_user_community_role(community_id)='owner') with check(public.current_user_community_role(community_id)='owner');

create or replace function public.bootstrap_current_user(p_display_name text default null)
returns table(profile_id uuid,member_id uuid,community_id uuid,role public.member_role,active boolean)
language plpgsql security definer set search_path=public as $$
declare v_email text:=lower(coalesce(auth.jwt()->>'email','')); v_profile uuid; v_inv public.community_invitations%rowtype;
begin
  if auth.uid() is null or v_email='' then raise exception 'authentication required' using errcode='42501'; end if;
  select * into v_inv from community_invitations where lower(email)=v_email and accepted_at is null and expires_at>now() order by created_at limit 1 for update;
  select id into v_profile from profiles where auth_user_id=auth.uid();
  if v_profile is null and v_inv.id is not null then
    insert into profiles(auth_user_id,display_name) values(auth.uid(),coalesce(nullif(trim(p_display_name),''),split_part(v_email,'@',1))) returning id into v_profile;
  end if;
  if v_profile is not null and v_inv.id is not null then
    insert into community_members(community_id,profile_id,role,active) values(v_inv.community_id,v_profile,v_inv.role,true) on conflict(community_id,profile_id) do nothing;
    update community_invitations set accepted_at=now() where id=v_inv.id;
  end if;
  return query select p.id,cm.id,cm.community_id,cm.role,cm.active from profiles p join community_members cm on cm.profile_id=p.id where p.auth_user_id=auth.uid() and cm.active order by cm.created_at limit 1;
end$$;
grant execute on function public.bootstrap_current_user(text) to authenticated;
revoke all on function public.is_active_member(uuid),public.current_user_community_role(uuid),public.bootstrap_current_user(text) from public,anon;
grant execute on function public.is_active_member(uuid),public.current_user_community_role(uuid),public.bootstrap_current_user(text) to authenticated;

-- Complete policies for every application table.
create policy event_members_read on public.event_members for select using(exists(select 1 from events e where e.id=event_id and is_active_member(e.community_id)));
create policy event_members_write on public.event_members for all using(exists(select 1 from events e where e.id=event_id and current_user_community_role(e.community_id) in ('owner','admin'))) with check(exists(select 1 from events e where e.id=event_id and current_user_community_role(e.community_id) in ('owner','admin')));
create policy line_users_read on public.line_users for select using(exists(select 1 from line_messages lm where lm.line_user_id=line_users.id and is_active_member(lm.community_id)));
create policy groups_owner_write on public.line_groups for all using(current_user_community_role(community_id)='owner') with check(current_user_community_role(community_id)='owner');
create policy logs_insert on public.activity_logs for insert with check(is_active_member(community_id) and actor_id=(select id from profiles where auth_user_id=auth.uid()));
create policy profiles_self_update on public.profiles for update using(auth_user_id=auth.uid()) with check(auth_user_id=auth.uid());

-- A LINE conversion and status update are atomic, preserve source_id, and cannot be replayed.
create or replace function public.convert_line_message_to_task(p_message_id uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare m line_messages%rowtype; pid uuid; tid uuid;
begin
 select * into m from line_messages where id=p_message_id for update;
 if m.id is null or coalesce(current_user_community_role(m.community_id)::text,'') not in ('owner','admin') then raise exception 'forbidden' using errcode='42501'; end if;
 if m.status<>'unprocessed' then raise exception 'message already processed'; end if;
 select id into pid from profiles where auth_user_id=auth.uid();
 insert into tasks(community_id,title,description,status,priority,assignee_id,due_date,source_type,source_id,created_by)
 values(m.community_id,left(p_payload->>'title',160),coalesce(p_payload->>'description',m.text,''),coalesce((p_payload->>'status')::task_status,'todo'),coalesce((p_payload->>'priority')::task_priority,'medium'),nullif(p_payload->>'assignee_id','')::uuid,nullif(p_payload->>'due_date','')::timestamptz,'line',m.id,pid) returning id into tid;
 update line_messages set status='task_created' where id=m.id;
 insert into activity_logs(community_id,actor_id,action,entity_type,entity_id,metadata) values(m.community_id,pid,'line_task_created','task',tid,jsonb_build_object('line_message_id',m.id));
 return tid;
end$$;
create or replace function public.convert_line_message_to_event(p_message_id uuid,p_payload jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare m line_messages%rowtype; pid uuid; eid uuid;
begin
 select * into m from line_messages where id=p_message_id for update;
 if m.id is null or coalesce(current_user_community_role(m.community_id)::text,'') not in ('owner','admin') then raise exception 'forbidden' using errcode='42501'; end if;
 if m.status<>'unprocessed' then raise exception 'message already processed'; end if;
 if (p_payload->>'end_at')::timestamptz < (p_payload->>'start_at')::timestamptz then raise exception 'invalid date range'; end if;
 select id into pid from profiles where auth_user_id=auth.uid();
 insert into events(community_id,title,description,location,start_at,end_at,all_day,google_sync_status,created_by,source_type,source_id)
 values(m.community_id,left(p_payload->>'title',160),coalesce(p_payload->>'description',m.text,''),coalesce(p_payload->>'location',''),(p_payload->>'start_at')::timestamptz,(p_payload->>'end_at')::timestamptz,coalesce((p_payload->>'all_day')::boolean,false),'pending',pid,'line',m.id) returning id into eid;
 update line_messages set status='event_created' where id=m.id;
 insert into activity_logs(community_id,actor_id,action,entity_type,entity_id,metadata) values(m.community_id,pid,'line_event_created','event',eid,jsonb_build_object('line_message_id',m.id));
 return eid;
end$$;
grant execute on function public.convert_line_message_to_task(uuid,jsonb),public.convert_line_message_to_event(uuid,jsonb) to authenticated;
revoke all on function public.convert_line_message_to_task(uuid,jsonb),public.convert_line_message_to_event(uuid,jsonb) from public,anon;
revoke update on public.line_messages from authenticated;
grant update(status) on public.line_messages to authenticated;

-- Server-only, expiring and single-use OAuth state. No client policy is intentionally provided.
create table public.google_oauth_states(
 id uuid primary key default gen_random_uuid(), state_hash text not null unique, user_id uuid not null references auth.users on delete cascade,
 community_id uuid not null references public.communities on delete cascade, code_verifier text not null,
 expires_at timestamptz not null default now()+interval '10 minutes', consumed_at timestamptz, created_at timestamptz not null default now()
);
alter table public.google_oauth_states enable row level security;
alter table public.google_connections add column if not exists token_status text not null default 'active' check(token_status in ('active','revoked','error'));
alter table public.google_connections add column if not exists connected_at timestamptz not null default now();
revoke select on public.google_connections from authenticated;
grant select(id,community_id,google_email,calendar_id,token_status,created_by,created_at,updated_at,connected_at) on public.google_connections to authenticated;

-- Members can create events; only admins/owners can modify or delete all events.
drop policy if exists events_write on public.events;
create policy events_insert on public.events for insert with check(is_active_member(community_id));
create policy events_update on public.events for update using(current_user_community_role(community_id) in ('owner','admin') or created_by=(select id from profiles where auth_user_id=auth.uid())) with check(is_active_member(community_id));
create policy events_delete on public.events for delete using(current_user_community_role(community_id) in ('owner','admin') or created_by=(select id from profiles where auth_user_id=auth.uid()));
