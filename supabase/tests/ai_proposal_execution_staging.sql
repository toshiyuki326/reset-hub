-- Sprint 7 execution foundation, real-Postgres verification.
-- Run with `supabase test db` (requires Docker; not available in the environment this
-- deliverable was built in — see docs/THREAT_MODEL_SPRINT7.md and the FINAL REPORT).
-- All fixtures use a reserved UUID prefix and are rolled back; no existing data is read
-- or changed.
begin;
select plan(22);

select has_table('public','ai_proposal_executions','execution audit table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_proposal_executions'::regclass),'execution audit RLS active');
select has_index('public','ai_proposal_executions','ai_proposal_executions_active_idx','partial unique index preventing concurrent executing rows exists');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('fc000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exec-owner@example.invalid','',now(),'{}','{}',now(),now()),
 ('fc000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exec-member@example.invalid','',now(),'{}','{}',now(),now()),
 ('fc000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exec-inactive@example.invalid','',now(),'{}','{}',now(),now()),
 ('fc000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','exec-other@example.invalid','',now(),'{}','{}',now(),now());
insert into public.communities(id,name,slug) values
 ('fc100000-0000-0000-0000-000000000001','Exec A','exec-a-fc10'),
 ('fc100000-0000-0000-0000-000000000002','Exec B','exec-b-fc10');
insert into public.profiles(id,auth_user_id,display_name) values
 ('fc200000-0000-0000-0000-000000000001','fc000000-0000-0000-0000-000000000001','Owner'),
 ('fc200000-0000-0000-0000-000000000002','fc000000-0000-0000-0000-000000000002','Member'),
 ('fc200000-0000-0000-0000-000000000003','fc000000-0000-0000-0000-000000000003','Inactive'),
 ('fc200000-0000-0000-0000-000000000004','fc000000-0000-0000-0000-000000000004','Other');
insert into public.community_members(id,community_id,profile_id,role,active) values
 ('fc300000-0000-0000-0000-000000000001','fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000001','owner',true),
 ('fc300000-0000-0000-0000-000000000002','fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000002','member',true),
 ('fc300000-0000-0000-0000-000000000003','fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000003','member',false),
 ('fc300000-0000-0000-0000-000000000004','fc100000-0000-0000-0000-000000000002','fc200000-0000-0000-0000-000000000004','member',true);

-- A pre-existing task in community B, used to prove cross-community update_task is rejected.
insert into public.tasks(id,community_id,title,status,priority,source_type,created_by) values
 ('fc400000-0000-0000-0000-000000000001','fc100000-0000-0000-0000-000000000002','Other community task','todo','medium','manual','fc200000-0000-0000-0000-000000000004');

-- Each session is owned by the Member profile; three approved proposals exercise the
-- success path, the cross-community rollback path, and the double-execution path.
insert into public.ai_conversation_sessions(id,community_id,profile_id,title) values
 ('fc500000-0000-0000-0000-000000000001','fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000002','Member session');
insert into public.ai_conversation_messages(id,community_id,session_id,role,content,proposal,proposal_status,approved_by,approved_at) values
 ('fc600000-0000-0000-0000-000000000001','fc100000-0000-0000-0000-000000000001','fc500000-0000-0000-0000-000000000001','assistant','create a task',
   '{"title":"t","summary":"s","actions":[{"kind":"create_task","target":"task","payload":{"title":"Prepare handout","description":null,"status":null,"priority":null,"assignee_id":null,"due_date":null,"goal_id":null,"target_date":null,"location":null,"start_at":null,"end_at":null,"all_day":null}}]}'::jsonb,
   'approved','fc200000-0000-0000-0000-000000000002',now()),
 ('fc600000-0000-0000-0000-000000000002','fc100000-0000-0000-0000-000000000001','fc500000-0000-0000-0000-000000000001','assistant','update another community task',
   '{"title":"t","summary":"s","actions":[{"kind":"update_task","target":"fc400000-0000-0000-0000-000000000001","payload":{"title":"Blocked","description":null,"status":null,"priority":null,"assignee_id":null,"due_date":null,"goal_id":null,"target_date":null,"location":null,"start_at":null,"end_at":null,"all_day":null}}]}'::jsonb,
   'approved','fc200000-0000-0000-0000-000000000002',now());

set local role postgres;

-- ★ Requirement A: a failure mid-execution rolls the claim back to 'approved', not stuck 'executing'.
select throws_ok(
  $$select public.execute_ai_proposal('fc600000-0000-0000-0000-000000000002'::uuid,'fc200000-0000-0000-0000-000000000002'::uuid)$$,
  'AI007', null, 'cross-community update_task is rejected'
);
select results_eq(
  $$select proposal_status::text from public.ai_conversation_messages where id='fc600000-0000-0000-0000-000000000002'$$,
  $$values ('approved'::text)$$,
  'the rejected attempt rolled the claim back to approved, not stuck executing'
);
select results_eq(
  $$select count(*)::int from public.ai_proposal_executions where message_id='fc600000-0000-0000-0000-000000000002'$$,
  $$values (0)$$,
  'no execution row was left behind by the rolled-back attempt (nothing to roll back manually)'
);

-- Success path: create_task actually creates a task scoped to the proposal community.
select lives_ok(
  $$select public.execute_ai_proposal('fc600000-0000-0000-0000-000000000001'::uuid,'fc200000-0000-0000-0000-000000000002'::uuid)$$,
  'an approved single-action create_task proposal executes successfully'
);
select results_eq(
  $$select proposal_status::text from public.ai_conversation_messages where id='fc600000-0000-0000-0000-000000000001'$$,
  $$values ('executed'::text)$$,
  'the message is marked executed'
);
select results_eq(
  $$select count(*)::int from public.tasks where community_id='fc100000-0000-0000-0000-000000000001' and title='Prepare handout'$$,
  $$values (1)$$,
  'exactly one task was created, in the proposal''s own community'
);
select results_eq(
  $$select status from public.ai_proposal_executions where message_id='fc600000-0000-0000-0000-000000000001'$$,
  $$values ('executed'::text)$$,
  'the audit row reflects the successful execution'
);

-- Double execution: the second attempt on an already-executed proposal is rejected,
-- and no second task is created.
select throws_ok(
  $$select public.execute_ai_proposal('fc600000-0000-0000-0000-000000000001'::uuid,'fc200000-0000-0000-0000-000000000002'::uuid)$$,
  'AI003', null, 're-executing an already-executed proposal is rejected'
);
select results_eq(
  $$select count(*)::int from public.tasks where community_id='fc100000-0000-0000-0000-000000000001' and title='Prepare handout'$$,
  $$values (1)$$,
  'double execution did not create a second task'
);

-- The database-level guarantee behind double-execution prevention: two 'executing' rows
-- for the same proposal cannot coexist, independent of the row lock/claim logic above.
select throws_ok(
  $$insert into public.ai_proposal_executions(community_id,message_id,session_id,executor_profile_id,approved_by,action_count,status)
    select community_id,id,session_id,approved_by,approved_by,1,'executing' from public.ai_conversation_messages where id='fc600000-0000-0000-0000-000000000001'
    union all
    select community_id,id,session_id,approved_by,approved_by,1,'executing' from public.ai_conversation_messages where id='fc600000-0000-0000-0000-000000000001'$$,
  '23505', null, 'the partial unique index rejects a second concurrently-executing row for the same proposal'
);

-- Authorization re-derivation inside the function (SECURITY DEFINER bypasses RLS).
select throws_ok(
  $$select public.execute_ai_proposal('fc600000-0000-0000-0000-000000000002'::uuid,'fc200000-0000-0000-0000-000000000004'::uuid)$$,
  'AI008', null, 'a profile outside the session is rejected even with a superuser connection'
);
select throws_ok(
  $$select public.execute_ai_proposal('fc600000-0000-0000-0000-000000000002'::uuid,'fc200000-0000-0000-0000-000000000003'::uuid)$$,
  'AI008', null, 'an inactive-member profile that does not own the session is still rejected by session ownership first'
);

-- The separate, small "record a terminal failure" transaction: only for the
-- non-retryable error classes, never touching task data, and always with its own
-- fresh audit row (the original 'executing' audit row was rolled back with everything
-- else in the failed attempt above).
select lives_ok(
  $$select public.mark_ai_proposal_failed('fc600000-0000-0000-0000-000000000002'::uuid,'fc200000-0000-0000-0000-000000000002'::uuid,'COMMUNITY_MISMATCH')$$,
  'the session owner can record a terminal failure for a non-retryable error'
);
select results_eq(
  $$select proposal_status::text from public.ai_conversation_messages where id='fc600000-0000-0000-0000-000000000002'$$,
  $$values ('failed'::text)$$,
  'the proposal is now terminally failed, not left approved for indefinite silent retry'
);
select results_eq(
  $$select safe_error_code from public.ai_proposal_executions where message_id='fc600000-0000-0000-0000-000000000002' and status='failed'$$,
  $$values ('COMMUNITY_MISMATCH'::text)$$,
  'a fresh failed audit row records the reason'
);

-- ★ Requirement B: the proposal payload cannot be changed once approved, at the DB level,
-- even from a superuser connection that bypasses every application-level check.
select throws_ok(
  $$update public.ai_conversation_messages set proposal='{"title":"t","summary":"s","actions":[]}'::jsonb where id='fc600000-0000-0000-0000-000000000002'$$,
  'AI011', null, 'the immutability trigger blocks editing an approved proposal payload directly'
);
select lives_ok(
  $$update public.ai_conversation_messages set content='edited caption' where id='fc600000-0000-0000-0000-000000000002'$$,
  'the trigger only protects the proposal column, not unrelated columns'
);

-- Browsers cannot call the executor RPC directly (only service_role may).
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fc000000-0000-0000-0000-000000000002","email":"exec-member@example.invalid","role":"authenticated"}',true);
select throws_ok(
  $$select public.execute_ai_proposal('fc600000-0000-0000-0000-000000000002'::uuid,'fc200000-0000-0000-0000-000000000002'::uuid)$$,
  '42501', null, 'authenticated (browser) role has no execute grant on execute_ai_proposal'
);
select throws_ok(
  $$insert into public.ai_proposal_executions(community_id,message_id,session_id,executor_profile_id,approved_by,action_count,status) values('fc100000-0000-0000-0000-000000000001','fc600000-0000-0000-0000-000000000002','fc500000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000002','fc200000-0000-0000-0000-000000000002',0,'executing')$$,
  '42501', null, 'authenticated cannot write to the execution audit table directly'
);

select * from finish();
rollback;
