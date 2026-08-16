-- RC security hardening: replace migration 007's broad service-role grants with
-- the operations actually used by the browser and Edge Functions.
revoke all on table
  public.communities, public.tasks, public.events, public.event_members,
  public.line_groups, public.line_users, public.line_messages,
  public.google_connections, public.activity_logs
from anon, authenticated, service_role;

grant select on table public.communities, public.line_groups, public.activity_logs to authenticated;
grant select, insert, update, delete on table public.tasks, public.events, public.google_connections to authenticated;
grant select, update on table public.line_messages to authenticated;

grant select, insert, update, delete on table
  public.communities, public.tasks, public.events, public.event_members,
  public.line_groups, public.line_users, public.line_messages,
  public.google_connections, public.activity_logs
to service_role;

revoke all on table
  public.profiles, public.community_members, public.project_goals,
  public.project_kpis, public.project_kpi_entries,
  public.ai_conversation_sessions, public.ai_conversation_messages,
  public.ai_usage_events
from anon, authenticated, service_role;

grant select on table public.profiles, public.community_members to authenticated, service_role;
grant select, insert, update, delete on table public.project_goals, public.project_kpis to authenticated;
grant select, insert on table public.project_kpi_entries, public.ai_usage_events to authenticated;
grant select, insert, update on table public.ai_conversation_sessions to authenticated;
grant select, insert on table public.ai_conversation_messages to authenticated;

grant select on table public.project_goals, public.project_kpis, public.project_kpi_entries to service_role;
grant select, insert, update on table public.ai_conversation_sessions to service_role;
grant select, insert on table public.ai_conversation_messages, public.ai_usage_events to service_role;
revoke all on table public.ai_proposal_executions from service_role;
grant select on table public.ai_proposal_executions to service_role;

-- Trigger functions are not API endpoints. Remove the default PUBLIC execute
-- privilege and pin their lookup path as defense in depth.
alter function public.protect_approved_ai_proposal() set search_path = public, pg_temp;
revoke all on function public.protect_approved_ai_proposal() from public, anon, authenticated, service_role;
alter function public.bootstrap_current_user(text) set search_path = public, pg_temp;
alter function public.convert_line_message_to_event(uuid,jsonb) set search_path = public, pg_temp;
alter function public.convert_line_message_to_task(uuid,jsonb) set search_path = public, pg_temp;
alter function public.current_user_community_role(uuid) set search_path = public, pg_temp;
alter function public.is_active_member(uuid) set search_path = public, pg_temp;
alter function public.review_ai_proposal(uuid,text) set search_path = public, pg_temp;

-- Expand the fixed allowlist executor. There is deliberately no dynamic table,
-- column, function, or SQL selection from proposal data.
create or replace function public.execute_ai_proposal(p_message_id uuid, p_profile_id uuid)
returns public.ai_conversation_messages
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_message public.ai_conversation_messages%rowtype;
  v_session public.ai_conversation_sessions%rowtype;
  v_role public.member_role;
  v_active boolean;
  v_execution_id uuid := gen_random_uuid();
  v_actions jsonb;
  v_action jsonb;
  v_kind text;
  v_target text;
  v_payload jsonb;
  v_action_kinds text[] := '{}';
  v_action_count integer := 0;
  v_task public.tasks%rowtype;
  v_goal public.project_goals%rowtype;
  v_new_id uuid;
  v_before_snapshot jsonb := '[]'::jsonb;
  v_after_snapshot jsonb := '[]'::jsonb;
begin
  select m.* into v_message from public.ai_conversation_messages m where m.id=p_message_id for update;
  if v_message.id is null then raise exception 'proposal not found' using errcode='AI008'; end if;

  select s.* into v_session from public.ai_conversation_sessions s
   where s.id=v_message.session_id and s.community_id=v_message.community_id;
  if v_session.id is null or v_session.profile_id<>p_profile_id then
    raise exception 'session ownership mismatch' using errcode='AI008';
  end if;
  select cm.role,cm.active into v_role,v_active from public.community_members cm
   where cm.community_id=v_message.community_id and cm.profile_id=p_profile_id;
  if coalesce(v_active,false) is not true then raise exception 'inactive member' using errcode='AI009'; end if;

  if v_message.proposal_status='executing' then raise exception 'already executing' using errcode='AI002';
  elsif v_message.proposal_status='executed' then raise exception 'already executed' using errcode='AI003';
  elsif v_message.proposal_status<>'approved' or v_message.proposal is null or v_message.approved_by is null then
    raise exception 'proposal not approved' using errcode='AI001';
  end if;

  v_actions:=coalesce(v_message.proposal->'actions','[]'::jsonb);
  if jsonb_typeof(v_actions)<>'array' or jsonb_array_length(v_actions)=0 or jsonb_array_length(v_actions)>10 then
    raise exception 'invalid action list' using errcode='AI005';
  end if;
  for v_action in select * from jsonb_array_elements(v_actions) loop
    if (v_action->>'kind') not in ('create_task','update_task','create_goal','update_goal','create_event') then
      raise exception 'unsupported action kind' using errcode='AI004';
    end if;
    if jsonb_typeof(v_action->'payload')<>'object' then raise exception 'invalid payload' using errcode='AI005'; end if;
  end loop;

  update public.ai_conversation_messages set proposal_status='executing',execution_id=v_execution_id,
    execution_started_at=now(),execution_error_code=null where id=p_message_id;
  insert into public.ai_proposal_executions(execution_id,community_id,message_id,session_id,
    executor_profile_id,approved_by,action_count,status,started_at)
  values(v_execution_id,v_message.community_id,v_message.id,v_message.session_id,p_profile_id,
    v_message.approved_by,jsonb_array_length(v_actions),'executing',now());

  for v_action in select * from jsonb_array_elements(v_actions) loop
    v_kind:=v_action->>'kind'; v_target:=nullif(v_action->>'target',''); v_payload:=v_action->'payload';
    v_action_kinds:=array_append(v_action_kinds,v_kind); v_action_count:=v_action_count+1;

    if v_kind in ('create_task','update_task') and nullif(v_payload->>'assignee_id','') is not null
      and not exists(select 1 from public.community_members where id=(v_payload->>'assignee_id')::uuid
                     and community_id=v_message.community_id and active) then
      raise exception 'assignee not active in community' using errcode='AI005';
    end if;

    if v_kind='create_task' then
      if coalesce(nullif(trim(v_payload->>'title'),''),'')='' then raise exception 'title required' using errcode='AI005'; end if;
      insert into public.tasks(community_id,title,description,status,priority,assignee_id,due_date,source_type,created_by)
      values(v_message.community_id,left(v_payload->>'title',160),coalesce(v_payload->>'description',''),
        coalesce(nullif(v_payload->>'status','')::public.task_status,'todo'),
        coalesce(nullif(v_payload->>'priority','')::public.task_priority,'medium'),
        nullif(v_payload->>'assignee_id','')::uuid,nullif(v_payload->>'due_date','')::timestamptz,'manual',v_message.approved_by)
      returning id into v_new_id;
      v_after_snapshot:=v_after_snapshot||jsonb_build_array(jsonb_build_object('kind',v_kind,'task_id',v_new_id));

    elsif v_kind='update_task' then
      if v_target is null then raise exception 'target required' using errcode='AI005'; end if;
      begin select t.* into v_task from public.tasks t where t.id=v_target::uuid for update;
      exception when invalid_text_representation then raise exception 'invalid target' using errcode='AI005'; end;
      if v_task.id is null then raise exception 'target not found' using errcode='AI006'; end if;
      if v_task.community_id<>v_message.community_id then raise exception 'community mismatch' using errcode='AI007'; end if;
      if not (v_role in ('owner','admin') or v_task.created_by=v_message.approved_by or
        v_task.assignee_id=(select id from public.community_members where community_id=v_message.community_id and profile_id=v_message.approved_by)) then
        raise exception 'permission denied' using errcode='AI008';
      end if;
      v_before_snapshot:=v_before_snapshot||jsonb_build_array(jsonb_build_object('kind',v_kind,'task_id',v_task.id,
        'before',jsonb_build_object('status',v_task.status,'priority',v_task.priority,'assignee_id',v_task.assignee_id,'due_date',v_task.due_date)));
      update public.tasks set title=coalesce(nullif(v_payload->>'title',''),title),
        description=coalesce(v_payload->>'description',description),status=coalesce(nullif(v_payload->>'status','')::public.task_status,status),
        priority=coalesce(nullif(v_payload->>'priority','')::public.task_priority,priority),
        assignee_id=coalesce(nullif(v_payload->>'assignee_id','')::uuid,assignee_id),
        due_date=coalesce(nullif(v_payload->>'due_date','')::timestamptz,due_date),
        completed_at=case when nullif(v_payload->>'status','')='done' and status<>'done' then now() else completed_at end,updated_at=now()
      where id=v_task.id;
      v_after_snapshot:=v_after_snapshot||jsonb_build_array(jsonb_build_object('kind',v_kind,'task_id',v_task.id));

    elsif v_kind='create_goal' then
      if v_role not in ('owner','admin') then raise exception 'permission denied' using errcode='AI008'; end if;
      if coalesce(nullif(trim(v_payload->>'title'),''),'')='' then raise exception 'title required' using errcode='AI005'; end if;
      insert into public.project_goals(community_id,title,description,status,target_date,created_by)
      values(v_message.community_id,left(v_payload->>'title',160),coalesce(v_payload->>'description',''),
        coalesce(nullif(v_payload->>'status','')::public.goal_status,'draft'),nullif(v_payload->>'target_date','')::date,v_message.approved_by)
      returning id into v_new_id;
      v_after_snapshot:=v_after_snapshot||jsonb_build_array(jsonb_build_object('kind',v_kind,'goal_id',v_new_id));

    elsif v_kind='update_goal' then
      if v_role not in ('owner','admin') then raise exception 'permission denied' using errcode='AI008'; end if;
      if v_target is null then raise exception 'target required' using errcode='AI005'; end if;
      begin select g.* into v_goal from public.project_goals g where g.id=v_target::uuid for update;
      exception when invalid_text_representation then raise exception 'invalid target' using errcode='AI005'; end;
      if v_goal.id is null then raise exception 'target not found' using errcode='AI006'; end if;
      if v_goal.community_id<>v_message.community_id then raise exception 'community mismatch' using errcode='AI007'; end if;
      v_before_snapshot:=v_before_snapshot||jsonb_build_array(jsonb_build_object('kind',v_kind,'goal_id',v_goal.id,
        'before',jsonb_build_object('status',v_goal.status,'target_date',v_goal.target_date)));
      update public.project_goals set title=coalesce(nullif(v_payload->>'title',''),title),
        description=coalesce(v_payload->>'description',description),status=coalesce(nullif(v_payload->>'status','')::public.goal_status,status),
        target_date=coalesce(nullif(v_payload->>'target_date','')::date,target_date),updated_at=now() where id=v_goal.id;
      v_after_snapshot:=v_after_snapshot||jsonb_build_array(jsonb_build_object('kind',v_kind,'goal_id',v_goal.id));

    elsif v_kind='create_event' then
      if v_role not in ('owner','admin') then raise exception 'permission denied' using errcode='AI008'; end if;
      if coalesce(nullif(trim(v_payload->>'title'),''),'')='' or nullif(v_payload->>'start_at','') is null then
        raise exception 'title and start_at required' using errcode='AI005';
      end if;
      insert into public.events(community_id,title,description,location,start_at,end_at,all_day,created_by)
      values(v_message.community_id,left(v_payload->>'title',160),coalesce(v_payload->>'description',''),coalesce(v_payload->>'location',''),
        (v_payload->>'start_at')::timestamptz,nullif(v_payload->>'end_at','')::timestamptz,coalesce((v_payload->>'all_day')::boolean,false),v_message.approved_by)
      returning id into v_new_id;
      v_after_snapshot:=v_after_snapshot||jsonb_build_array(jsonb_build_object('kind',v_kind,'event_id',v_new_id));
    end if;
  end loop;

  update public.ai_conversation_messages set proposal_status='executed',executed_at=now() where id=p_message_id returning * into v_message;
  update public.ai_proposal_executions set status='executed',action_kinds=v_action_kinds,before_snapshot=v_before_snapshot,
    after_snapshot=v_after_snapshot,completed_at=now() where execution_id=v_execution_id;
  insert into public.activity_logs(community_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_message.community_id,v_message.approved_by,'ai_proposal_executed','ai_conversation_message',v_message.id,
    jsonb_build_object('execution_id',v_execution_id,'action_count',v_action_count));
  return v_message;
end
$$;

revoke all on function public.execute_ai_proposal(uuid,uuid) from public, anon, authenticated;
grant execute on function public.execute_ai_proposal(uuid,uuid) to service_role;
alter function public.mark_ai_proposal_failed(uuid,uuid,text) set search_path = public, pg_temp;

-- Atomic, database-backed provider rate limiting. A failed community claim rolls
-- back the user claim in the same RPC transaction.
create table public.ai_rate_limit_windows(
  scope text not null check(scope in ('profile','community')),
  scope_id uuid not null,
  window_started_at timestamptz not null,
  request_count integer not null check(request_count > 0),
  primary key(scope,scope_id,window_started_at)
);
revoke all on public.ai_rate_limit_windows from public, anon, authenticated, service_role;

create or replace function public.claim_project_ai_request(p_community_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_window timestamptz:=date_bin('5 minutes',now(),timestamptz '2000-01-01'); v_count integer;
begin
  if not exists(select 1 from public.community_members where community_id=p_community_id and profile_id=p_profile_id and active) then
    raise exception 'inactive member' using errcode='AI009';
  end if;
  insert into public.ai_rate_limit_windows(scope,scope_id,window_started_at,request_count)
  values('profile',p_profile_id,v_window,1)
  on conflict(scope,scope_id,window_started_at) do update set request_count=ai_rate_limit_windows.request_count+1
  returning request_count into v_count;
  if v_count>10 then raise exception 'profile rate limit' using errcode='AI010'; end if;
  insert into public.ai_rate_limit_windows(scope,scope_id,window_started_at,request_count)
  values('community',p_community_id,v_window,1)
  on conflict(scope,scope_id,window_started_at) do update set request_count=ai_rate_limit_windows.request_count+1
  returning request_count into v_count;
  if v_count>50 then raise exception 'community rate limit' using errcode='AI010'; end if;
  delete from public.ai_rate_limit_windows where window_started_at<now()-interval '1 day';
end $$;
revoke all on function public.claim_project_ai_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_project_ai_request(uuid,uuid) to service_role;
