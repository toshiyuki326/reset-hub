begin;
select plan(28);

select has_table('public','project_goals','project goals exist');
select has_table('public','project_kpis','project KPIs exist');
select has_table('public','project_kpi_entries','project KPI entries exist');
select has_table('public','ai_conversation_sessions','AI sessions exist');
select has_table('public','ai_conversation_messages','AI messages exist');
select has_table('public','ai_usage_events','AI usage events exist');
select row_security_active('public','project_goals','goals RLS active');
select row_security_active('public','project_kpis','KPIs RLS active');
select row_security_active('public','project_kpi_entries','KPI entries RLS active');
select row_security_active('public','ai_conversation_sessions','sessions RLS active');
select row_security_active('public','ai_conversation_messages','messages RLS active');
select row_security_active('public','ai_usage_events','usage RLS active');

-- Existing staging data is never selected or changed. All fixtures use reserved UUIDs
-- and are rolled back at the end of this transaction.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
 ('f1000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-owner@example.invalid','',now(),'{}','{}',now(),now()),
 ('f1000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-admin@example.invalid','',now(),'{}','{}',now(),now()),
 ('f1000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-member@example.invalid','',now(),'{}','{}',now(),now()),
 ('f1000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-inactive@example.invalid','',now(),'{}','{}',now(),now()),
 ('f1000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-other@example.invalid','',now(),'{}','{}',now(),now());
insert into public.communities(id,name,slug) values
 ('f2000000-0000-0000-0000-000000000001','RLS A','rls-a-f200'),
 ('f2000000-0000-0000-0000-000000000002','RLS B','rls-b-f200');
insert into public.profiles(id,auth_user_id,display_name) values
 ('f3000000-0000-0000-0000-000000000001','f1000000-0000-0000-0000-000000000001','Owner'),
 ('f3000000-0000-0000-0000-000000000002','f1000000-0000-0000-0000-000000000002','Admin'),
 ('f3000000-0000-0000-0000-000000000003','f1000000-0000-0000-0000-000000000003','Member'),
 ('f3000000-0000-0000-0000-000000000004','f1000000-0000-0000-0000-000000000004','Inactive'),
 ('f3000000-0000-0000-0000-000000000005','f1000000-0000-0000-0000-000000000005','Other');
insert into public.community_members(community_id,profile_id,role,active) values
 ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','owner',true),
 ('f2000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000001','owner',true),
 ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000002','admin',true),
 ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000003','member',true),
 ('f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000004','member',false),
 ('f2000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000005','member',true);
insert into public.project_goals(id,community_id,title,status,created_by) values
 ('f4000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','Goal A','active','f3000000-0000-0000-0000-000000000001'),
 ('f4000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002','Goal B','active','f3000000-0000-0000-0000-000000000001');
insert into public.project_kpis(id,community_id,goal_id,name,created_by) values
 ('f5000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000001','KPI A','f3000000-0000-0000-0000-000000000001');
insert into public.ai_conversation_sessions(id,community_id,profile_id,title) values
 ('f6000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000003','Member session'),
 ('f6000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000005','Other session');
insert into public.ai_conversation_messages(id,community_id,session_id,role,content,proposal,proposal_status) values
 ('f7000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001','assistant','proposal','{"kind":"create_task"}','proposal');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000003","email":"rls-member@example.invalid","role":"authenticated"}',true);
select results_eq($$select title from public.project_goals order by title$$,$$values ('Goal A'::text)$$,'active member reads own community only');
select results_eq($$with changed as (update public.project_goals set title='blocked' where id='f4000000-0000-0000-0000-000000000001' returning id) select id::text from changed$$,$$select null::text where false$$,'member cannot update goals');
select results_eq($$select title from public.project_goals where id='f4000000-0000-0000-0000-000000000002'$$,$$select null::text where false$$,'member cannot read another community');
select results_eq($$select title from public.ai_conversation_sessions order by title$$,$$values ('Member session'::text)$$,'sessions are limited to owner');
select results_eq($$select content from public.ai_conversation_messages$$,$$values ('proposal'::text)$$,'messages are limited to owner');

select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000004","email":"rls-inactive@example.invalid","role":"authenticated"}',true);
select results_eq($$select title from public.project_goals$$,$$select null::text where false$$,'inactive member cannot read goals');

select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000002","email":"rls-admin@example.invalid","role":"authenticated"}',true);
select results_eq($$with changed as (update public.project_goals set title='Admin updated' where id='f4000000-0000-0000-0000-000000000001' returning id) select id::text from changed$$,$$values ('f4000000-0000-0000-0000-000000000001'::text)$$,'admin can update goals');
select results_eq($$with changed as (update public.project_kpis set description='Admin updated' where id='f5000000-0000-0000-0000-000000000001' returning id) select id::text from changed$$,$$values ('f5000000-0000-0000-0000-000000000001'::text)$$,'admin can update KPIs');

select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000001","email":"rls-owner@example.invalid","role":"authenticated"}',true);
select lives_ok($$insert into public.project_goals(id,community_id,title,created_by) values ('f4000000-0000-0000-0000-000000000003','f2000000-0000-0000-0000-000000000001','Owner goal','f3000000-0000-0000-0000-000000000001')$$,'owner can create goals');
select lives_ok($$insert into public.project_kpis(id,community_id,goal_id,name,created_by) values ('f5000000-0000-0000-0000-000000000002','f2000000-0000-0000-0000-000000000001','f4000000-0000-0000-0000-000000000003','Owner KPI','f3000000-0000-0000-0000-000000000001')$$,'owner can create KPIs');
select throws_ok($$insert into public.project_kpis(community_id,goal_id,name,created_by) values ('f2000000-0000-0000-0000-000000000002','f4000000-0000-0000-0000-000000000001','Cross community KPI','f3000000-0000-0000-0000-000000000001')$$,'23503',null,'cross-community goal/KPI link is rejected');
select throws_ok($$insert into public.ai_conversation_messages(community_id,session_id,role,content) values ('f2000000-0000-0000-0000-000000000002','f6000000-0000-0000-0000-000000000001','user','cross')$$,'23503',null,'cross-community session/message link is rejected');

select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000005","email":"rls-other@example.invalid","role":"authenticated"}',true);
select results_eq($$select title from public.ai_conversation_sessions where id='f6000000-0000-0000-0000-000000000001'$$,$$select null::text where false$$,'other user cannot read member session');
select results_eq($$select content from public.ai_conversation_messages where id='f7000000-0000-0000-0000-000000000001'$$,$$select null::text where false$$,'other user cannot read member messages');

set local role postgres;
select throws_ok($$update public.ai_conversation_messages set proposal_status='approved',approved_by=null where id='f7000000-0000-0000-0000-000000000001'$$,'23514',null,'approved proposal requires approved_by');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-0000-0000-000000000003","email":"rls-member@example.invalid","role":"authenticated"}',true);
select lives_ok($$update public.ai_conversation_messages set proposal_status='executed',approved_by='f3000000-0000-0000-0000-000000000003' where id='f7000000-0000-0000-0000-000000000001'$$,'documents the 004 direct-execution security gap fixed by 005');

select * from finish();
rollback;
