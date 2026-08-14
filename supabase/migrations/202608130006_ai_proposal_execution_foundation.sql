-- Sprint 7: approved-proposal executor foundation.
-- Adding an enum value must be committed before it can be referenced by a later
-- statement in this file (Postgres restriction on ALTER TYPE ... ADD VALUE), so it
-- is isolated in its own explicit transaction ahead of everything else.
begin;
alter type public.ai_proposal_status add value if not exists 'executing' after 'approved';
commit;

-- Execution bookkeeping columns on the existing proposal row. executed_at already
-- exists (migration 004); execution_id is the mandatory idempotency key for a claim.
alter table public.ai_conversation_messages add column if not exists execution_started_at timestamptz;
alter table public.ai_conversation_messages add column if not exists execution_error_code text;
alter table public.ai_conversation_messages add column if not exists execution_id uuid;
alter table public.ai_conversation_messages add constraint ai_conversation_messages_id_community_key unique(id,community_id);
alter table public.ai_conversation_messages add constraint ai_conversation_messages_execution_id_check check(proposal_status not in ('executing','executed') or execution_id is not null);
alter table public.ai_conversation_messages add constraint ai_conversation_messages_execution_approver_check check(proposal_status not in ('executing','failed') or approved_by is not null);
alter table public.ai_conversation_messages add constraint ai_conversation_messages_error_code_check check((proposal_status='failed')=(execution_error_code is not null));

-- ★ Requirement B: once a proposal has left review, its payload/actions are immutable
-- at the database level, independent of which role or code path attempts the UPDATE.
create or replace function public.protect_approved_ai_proposal() returns trigger
language plpgsql as $$
begin
  if old.proposal_status not in ('proposal','review') and new.proposal is distinct from old.proposal then
    raise exception 'approved proposal payload is immutable' using errcode='AI011';
  end if;
  return new;
end
$$;
drop trigger if exists ai_conversation_messages_protect_proposal on public.ai_conversation_messages;
create trigger ai_conversation_messages_protect_proposal
  before update on public.ai_conversation_messages
  for each row execute function public.protect_approved_ai_proposal();

-- Execution audit trail. A partial unique index on (message_id) where status='executing'
-- is a second, independent DB-level guarantee (beyond the row lock) that at most one
-- execution attempt can be in flight for a given proposal at a time.
create table public.ai_proposal_executions(
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null default gen_random_uuid() unique,
  community_id uuid not null references public.communities on delete cascade,
  message_id uuid not null,
  session_id uuid not null,
  executor_profile_id uuid not null references public.profiles,
  approved_by uuid not null references public.profiles,
  action_count integer not null check(action_count>=0),
  action_kinds text[] not null default '{}',
  status text not null check(status in ('executing','executed','failed')),
  safe_error_code text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key(message_id,community_id) references public.ai_conversation_messages(id,community_id) on delete cascade
);
create unique index ai_proposal_executions_active_idx on public.ai_proposal_executions(message_id) where status='executing';
create index ai_proposal_executions_community_idx on public.ai_proposal_executions(community_id,started_at desc);
alter table public.ai_proposal_executions enable row level security;
create policy ai_proposal_executions_read on public.ai_proposal_executions for select using(public.is_active_member(community_id));
revoke all on public.ai_proposal_executions from authenticated,anon;
grant select on public.ai_proposal_executions to authenticated;

-- Atomic claim + execute. This is the ONLY place create_task/update_task DB writes for
-- AI proposals happen. It is invoked once via a single RPC call from the service-role
-- Edge Function, so claim (approved -> executing) and every subsequent write share one
-- Postgres transaction: any exception rolls back the claim along with the writes,
-- automatically leaving the row 'approved' again (★ Requirement A).
create or replace function public.execute_ai_proposal(
  p_message_id uuid,
  p_profile_id uuid
) returns public.ai_conversation_messages
language plpgsql
security definer
set search_path = public
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
  v_new_task_id uuid;
  v_before_snapshot jsonb := '[]'::jsonb;
  v_after_snapshot jsonb := '[]'::jsonb;
begin
  select m.* into v_message from public.ai_conversation_messages as m where m.id=p_message_id for update;
  if v_message.id is null then
    raise exception 'proposal not found' using errcode='AI008';
  end if;

  select s.* into v_session from public.ai_conversation_sessions as s
   where s.id=v_message.session_id and s.community_id=v_message.community_id;
  if v_session.id is null or v_session.profile_id<>p_profile_id then
    raise exception 'session ownership mismatch' using errcode='AI008';
  end if;

  select cm.role,cm.active into v_role,v_active from public.community_members as cm
   where cm.community_id=v_message.community_id and cm.profile_id=p_profile_id;
  if coalesce(v_active,false) is not true then
    raise exception 'inactive member' using errcode='AI009';
  end if;

  if v_message.proposal_status='executing' then
    raise exception 'already executing' using errcode='AI002';
  elsif v_message.proposal_status='executed' then
    raise exception 'already executed' using errcode='AI003';
  elsif v_message.proposal_status<>'approved' or v_message.proposal is null or v_message.approved_by is null then
    raise exception 'proposal not approved' using errcode='AI001';
  end if;

  v_actions:=coalesce(v_message.proposal->'actions','[]'::jsonb);
  if jsonb_array_length(v_actions)=0 then
    raise exception 'proposal has no executable actions' using errcode='AI005';
  end if;
  for v_action in select * from jsonb_array_elements(v_actions) loop
    if (v_action->>'kind') not in ('create_task','update_task') then
      raise exception 'unsupported action kind %',v_action->>'kind' using errcode='AI004';
    end if;
  end loop;

  -- Atomic claim: still inside the same transaction as every write below.
  update public.ai_conversation_messages
     set proposal_status='executing',execution_id=v_execution_id,execution_started_at=now(),execution_error_code=null
   where id=p_message_id;

  insert into public.ai_proposal_executions(execution_id,community_id,message_id,session_id,executor_profile_id,approved_by,action_count,status,started_at)
  values(v_execution_id,v_message.community_id,v_message.id,v_message.session_id,p_profile_id,v_message.approved_by,jsonb_array_length(v_actions),'executing',now());

  for v_action in select * from jsonb_array_elements(v_actions) loop
    v_kind:=v_action->>'kind';
    v_target:=nullif(v_action->>'target','');
    v_payload:=v_action->'payload';
    v_action_kinds:=array_append(v_action_kinds,v_kind);
    v_action_count:=v_action_count+1;

    if nullif(v_payload->>'assignee_id','') is not null
       and not exists(select 1 from public.community_members where id=(v_payload->>'assignee_id')::uuid and community_id=v_message.community_id) then
      raise exception 'assignee not in community' using errcode='AI005';
    end if;

    if v_kind='create_task' then
      if coalesce(nullif(trim(v_payload->>'title'),''),'')='' then
        raise exception 'create_task requires a title' using errcode='AI005';
      end if;
      insert into public.tasks(community_id,title,description,status,priority,assignee_id,due_date,source_type,created_by)
      values(
        v_message.community_id,
        left(v_payload->>'title',160),
        coalesce(v_payload->>'description',''),
        coalesce(nullif(v_payload->>'status','')::public.task_status,'todo'),
        coalesce(nullif(v_payload->>'priority','')::public.task_priority,'medium'),
        nullif(v_payload->>'assignee_id','')::uuid,
        nullif(v_payload->>'due_date','')::timestamptz,
        'manual',
        v_message.approved_by
      ) returning id into v_new_task_id;
      v_after_snapshot:=v_after_snapshot||jsonb_build_array(jsonb_build_object('kind','create_task','task_id',v_new_task_id));

    elsif v_kind='update_task' then
      if v_target is null then
        raise exception 'update_task requires a target task id' using errcode='AI005';
      end if;
      begin
        select t.* into v_task from public.tasks as t where t.id=v_target::uuid for update;
      exception when invalid_text_representation then
        raise exception 'update_task target is not a valid id' using errcode='AI005';
      end;
      if v_task.id is null then
        raise exception 'target task not found' using errcode='AI006';
      end if;
      if v_task.community_id<>v_message.community_id then
        raise exception 'target task belongs to another community' using errcode='AI007';
      end if;
      if not (v_role in ('owner','admin')
              or v_task.created_by=v_message.approved_by
              or v_task.assignee_id=(select id from public.community_members where community_id=v_message.community_id and profile_id=v_message.approved_by)) then
        raise exception 'insufficient permission to update this task' using errcode='AI008';
      end if;

      v_before_snapshot:=v_before_snapshot||jsonb_build_array(jsonb_build_object('kind','update_task','task_id',v_task.id,'before',jsonb_build_object('status',v_task.status,'priority',v_task.priority,'assignee_id',v_task.assignee_id,'due_date',v_task.due_date)));

      update public.tasks set
        title=coalesce(nullif(v_payload->>'title',''),title),
        description=coalesce(v_payload->>'description',description),
        status=coalesce(nullif(v_payload->>'status','')::public.task_status,status),
        priority=coalesce(nullif(v_payload->>'priority','')::public.task_priority,priority),
        assignee_id=coalesce(nullif(v_payload->>'assignee_id','')::uuid,assignee_id),
        due_date=coalesce(nullif(v_payload->>'due_date','')::timestamptz,due_date),
        completed_at=case when nullif(v_payload->>'status','')='done' and status<>'done' then now() else completed_at end,
        updated_at=now()
      where id=v_task.id;

      v_after_snapshot:=v_after_snapshot||jsonb_build_array(jsonb_build_object('kind','update_task','task_id',v_task.id));
    end if;
  end loop;

  update public.ai_conversation_messages set proposal_status='executed',executed_at=now() where id=p_message_id returning * into v_message;
  update public.ai_proposal_executions set status='executed',action_kinds=v_action_kinds,before_snapshot=v_before_snapshot,after_snapshot=v_after_snapshot,completed_at=now() where execution_id=v_execution_id;
  insert into public.activity_logs(community_id,actor_id,action,entity_type,entity_id,metadata)
  values(v_message.community_id,v_message.approved_by,'ai_proposal_executed','ai_conversation_message',v_message.id,jsonb_build_object('execution_id',v_execution_id,'action_count',v_action_count));

  return v_message;
end
$$;
revoke all on function public.execute_ai_proposal(uuid,uuid) from public,anon,authenticated;
grant execute on function public.execute_ai_proposal(uuid,uuid) to service_role;

-- Separate, small transaction used only to record a terminal, non-retryable failure
-- after the main transaction above has already rolled back to 'approved'. It never
-- touches task data. A no-op if the proposal is no longer 'approved' (e.g. a
-- concurrent call already resolved it), so it is safe to call defensively.
create or replace function public.mark_ai_proposal_failed(
  p_message_id uuid,
  p_profile_id uuid,
  p_error_code text
) returns public.ai_conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.ai_conversation_messages%rowtype;
  v_session public.ai_conversation_sessions%rowtype;
begin
  if p_error_code not in ('UNSUPPORTED_ACTION','INVALID_ACTION','TARGET_NOT_FOUND','COMMUNITY_MISMATCH','PERMISSION_DENIED','EXECUTION_FAILED') then
    raise exception 'invalid failure code' using errcode='AI005';
  end if;

  select m.* into v_message from public.ai_conversation_messages as m where m.id=p_message_id for update;
  if v_message.id is null then
    raise exception 'proposal not found' using errcode='AI008';
  end if;

  select s.* into v_session from public.ai_conversation_sessions as s
   where s.id=v_message.session_id and s.community_id=v_message.community_id;
  if v_session.id is null or v_session.profile_id<>p_profile_id then
    raise exception 'session ownership mismatch' using errcode='AI008';
  end if;

  if not exists(select 1 from public.community_members where community_id=v_message.community_id and profile_id=p_profile_id and active) then
    raise exception 'inactive member' using errcode='AI009';
  end if;

  if v_message.proposal_status<>'approved' then
    return v_message;
  end if;

  update public.ai_conversation_messages
     set proposal_status='failed',execution_error_code=p_error_code,executed_at=now()
   where id=p_message_id
   returning * into v_message;

  insert into public.ai_proposal_executions(execution_id,community_id,message_id,session_id,executor_profile_id,approved_by,action_count,status,safe_error_code,started_at,completed_at)
  values(gen_random_uuid(),v_message.community_id,v_message.id,v_message.session_id,p_profile_id,v_message.approved_by,coalesce(jsonb_array_length(v_message.proposal->'actions'),0),'failed',p_error_code,now(),now());

  return v_message;
end
$$;
revoke all on function public.mark_ai_proposal_failed(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mark_ai_proposal_failed(uuid,uuid,text) to service_role;
