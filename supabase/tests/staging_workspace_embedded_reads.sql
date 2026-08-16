begin;
select plan(25);

-- Privilege regression: these are the two relations embedded by loadWorkspace().
select ok(has_table_privilege('authenticated','public.event_members','select'),'authenticated can read embedded event_members');
select ok(has_table_privilege('authenticated','public.line_users','select'),'authenticated can read embedded line_users');
select ok(not has_table_privilege('anon','public.event_members','select'),'anon cannot read event_members');
select ok(not has_table_privilege('anon','public.line_users','select'),'anon cannot read line_users');
select ok(not has_table_privilege('authenticated','public.event_members','insert') and not has_table_privilege('authenticated','public.event_members','update') and not has_table_privilege('authenticated','public.event_members','delete'),'event_members remains read-only for authenticated');
select ok(not has_table_privilege('authenticated','public.line_users','insert') and not has_table_privilege('authenticated','public.line_users','update') and not has_table_privilege('authenticated','public.line_users','delete'),'line_users remains read-only for authenticated');
select ok(has_table_privilege('service_role','public.event_members','select,insert,update,delete') and has_table_privilege('service_role','public.line_users','select,insert,update,delete'),'service_role foundation privileges are preserved');
select ok((select relrowsecurity from pg_class where oid='public.event_members'::regclass),'event_members RLS remains active');
select ok((select relrowsecurity from pg_class where oid='public.line_users'::regclass),'line_users RLS remains active');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='event_members' and policyname='event_members_read'),'event_members read policy exists');
select ok(exists(select 1 from pg_policies where schemaname='public' and tablename='line_users' and policyname='line_users_read'),'line_users read policy exists');
select ok(has_table_privilege('authenticated','public.events','select'),'events top-level SELECT remains granted');
select ok(has_table_privilege('authenticated','public.line_messages','select') and has_table_privilege('authenticated','public.line_groups','select'),'LINE top-level and group SELECT remain granted');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('fb000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-owner@example.invalid','',now(),'{}','{}',now(),now()),
 ('fb000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-admin@example.invalid','',now(),'{}','{}',now(),now()),
 ('fb000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-member@example.invalid','',now(),'{}','{}',now(),now()),
 ('fb000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-inactive@example.invalid','',now(),'{}','{}',now(),now()),
 ('fb000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','smoke-other@example.invalid','',now(),'{}','{}',now(),now());
insert into public.communities(id,name,slug) values
 ('fb100000-0000-0000-0000-000000000001','Smoke A','smoke-a-fb10'),
 ('fb100000-0000-0000-0000-000000000002','Smoke B','smoke-b-fb10');
insert into public.profiles(id,auth_user_id,display_name) values
 ('fb200000-0000-0000-0000-000000000001','fb000000-0000-0000-0000-000000000001','Owner'),
 ('fb200000-0000-0000-0000-000000000002','fb000000-0000-0000-0000-000000000002','Admin'),
 ('fb200000-0000-0000-0000-000000000003','fb000000-0000-0000-0000-000000000003','Member'),
 ('fb200000-0000-0000-0000-000000000004','fb000000-0000-0000-0000-000000000004','Inactive'),
 ('fb200000-0000-0000-0000-000000000005','fb000000-0000-0000-0000-000000000005','Other');
insert into public.community_members(id,community_id,profile_id,role,active) values
 ('fb300000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000001','owner',true),
 ('fb300000-0000-0000-0000-000000000002','fb100000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000002','admin',true),
 ('fb300000-0000-0000-0000-000000000003','fb100000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000003','member',true),
 ('fb300000-0000-0000-0000-000000000004','fb100000-0000-0000-0000-000000000001','fb200000-0000-0000-0000-000000000004','member',false),
 ('fb300000-0000-0000-0000-000000000005','fb100000-0000-0000-0000-000000000002','fb200000-0000-0000-0000-000000000005','member',true);
insert into public.events(id,community_id,title,start_at,created_by) values
 ('fb400000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000001','A event',now(),'fb200000-0000-0000-0000-000000000001'),
 ('fb400000-0000-0000-0000-000000000002','fb100000-0000-0000-0000-000000000002','B event',now(),'fb200000-0000-0000-0000-000000000005');
insert into public.event_members(event_id,member_id) values
 ('fb400000-0000-0000-0000-000000000001','fb300000-0000-0000-0000-000000000003'),
 ('fb400000-0000-0000-0000-000000000002','fb300000-0000-0000-0000-000000000005');
insert into public.line_groups(id,community_id,line_group_id,display_name) values
 ('fb500000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000001','line-smoke-a','A group'),
 ('fb500000-0000-0000-0000-000000000002','fb100000-0000-0000-0000-000000000002','line-smoke-b','B group');
insert into public.line_users(id,line_user_id,display_name,member_id) values
 ('fb600000-0000-0000-0000-000000000001','line-user-smoke-a','A sender','fb300000-0000-0000-0000-000000000003'),
 ('fb600000-0000-0000-0000-000000000002','line-user-smoke-b','B sender','fb300000-0000-0000-0000-000000000005');
insert into public.line_messages(id,community_id,line_group_id,line_user_id,line_message_id,message_type,text,received_at,raw_event) values
 ('fb700000-0000-0000-0000-000000000001','fb100000-0000-0000-0000-000000000001','fb500000-0000-0000-0000-000000000001','fb600000-0000-0000-0000-000000000001','line-message-smoke-a','text','A message',now(),'{}'),
 ('fb700000-0000-0000-0000-000000000002','fb100000-0000-0000-0000-000000000002','fb500000-0000-0000-0000-000000000002','fb600000-0000-0000-0000-000000000002','line-message-smoke-b','text','B message',now(),'{}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fb000000-0000-0000-0000-000000000001","email":"smoke-owner@example.invalid","role":"authenticated"}',true);
select is((select count(*)::int from public.events e left join public.event_members em on em.event_id=e.id where e.community_id='fb100000-0000-0000-0000-000000000001'),1,'owner frontend-shaped events embed succeeds');
select is((select count(*)::int from public.line_messages lm left join public.line_groups lg on lg.id=lm.line_group_id left join public.line_users lu on lu.id=lm.line_user_id where lm.community_id='fb100000-0000-0000-0000-000000000001'),1,'owner frontend-shaped LINE embed succeeds');
select set_config('request.jwt.claims','{"sub":"fb000000-0000-0000-0000-000000000002","email":"smoke-admin@example.invalid","role":"authenticated"}',true);
select is((select count(*)::int from public.events e left join public.event_members em on em.event_id=e.id where e.community_id='fb100000-0000-0000-0000-000000000001'),1,'admin frontend-shaped events embed succeeds');
select is((select count(*)::int from public.line_messages lm left join public.line_groups lg on lg.id=lm.line_group_id left join public.line_users lu on lu.id=lm.line_user_id where lm.community_id='fb100000-0000-0000-0000-000000000001'),1,'admin frontend-shaped LINE embed succeeds');
select set_config('request.jwt.claims','{"sub":"fb000000-0000-0000-0000-000000000003","email":"smoke-member@example.invalid","role":"authenticated"}',true);
select is((select count(*)::int from public.events e left join public.event_members em on em.event_id=e.id where e.community_id='fb100000-0000-0000-0000-000000000001'),1,'member frontend-shaped events embed succeeds');
select is((select count(*)::int from public.line_messages lm left join public.line_groups lg on lg.id=lm.line_group_id left join public.line_users lu on lu.id=lm.line_user_id where lm.community_id='fb100000-0000-0000-0000-000000000001'),1,'member frontend-shaped LINE embed succeeds');
select set_config('request.jwt.claims','{"sub":"fb000000-0000-0000-0000-000000000005","email":"smoke-other@example.invalid","role":"authenticated"}',true);
select is((select count(*)::int from public.events e left join public.event_members em on em.event_id=e.id where e.community_id='fb100000-0000-0000-0000-000000000001'),0,'cross-community events are hidden');
select is((select count(*)::int from public.line_messages lm left join public.line_groups lg on lg.id=lm.line_group_id left join public.line_users lu on lu.id=lm.line_user_id where lm.community_id='fb100000-0000-0000-0000-000000000001'),0,'cross-community LINE data is hidden');
select set_config('request.jwt.claims','{"sub":"fb000000-0000-0000-0000-000000000004","email":"smoke-inactive@example.invalid","role":"authenticated"}',true);
select is((select count(*)::int from public.events e left join public.event_members em on em.event_id=e.id),0,'inactive member cannot read events or embedded members');
select is((select count(*)::int from public.line_messages lm left join public.line_groups lg on lg.id=lm.line_group_id left join public.line_users lu on lu.id=lm.line_user_id),0,'inactive member cannot read LINE data or embeds');

set local role anon;
select throws_ok($$select count(*) from public.events e left join public.event_members em on em.event_id=e.id$$,'42501',null,'anon frontend-shaped events read is denied');
select throws_ok($$select count(*) from public.line_messages lm left join public.line_groups lg on lg.id=lm.line_group_id left join public.line_users lu on lu.id=lm.line_user_id$$,'42501',null,'anon frontend-shaped LINE read is denied');

select * from finish();
rollback;
