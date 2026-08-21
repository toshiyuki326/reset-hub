begin;
select plan(27);

select has_table('public','ai_generation_daily_quotas','daily AI generation quota table exists');
select ok(not has_table_privilege('authenticated','public.ai_generation_daily_quotas','select'),'authenticated cannot inspect quota counters');
select ok(not has_table_privilege('service_role','public.ai_generation_daily_quotas','select'),'service role cannot bypass the claim RPC with table access');
select ok(not has_function_privilege('authenticated','public.claim_project_ai_request(uuid,uuid)','execute'),'browser cannot claim quota directly');
select col_is_pk('public','ai_generation_daily_quotas',array['scope','scope_id','quota_date'],'daily counter has a concurrency-safe unique key');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('fc000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','quota-1@example.invalid','',now(),'{}','{}',now(),now()),
 ('fc000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','quota-2@example.invalid','',now(),'{}','{}',now(),now()),
 ('fc000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','quota-3@example.invalid','',now(),'{}','{}',now(),now()),
 ('fc000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','quota-inactive@example.invalid','',now(),'{}','{}',now(),now());
insert into public.communities(id,name,slug) values ('fc100000-0000-0000-0000-000000000001','Quota Community','quota-fc10');
insert into public.profiles(id,auth_user_id,display_name) values
 ('fc200000-0000-0000-0000-000000000001','fc000000-0000-0000-0000-000000000001','Quota One'),
 ('fc200000-0000-0000-0000-000000000002','fc000000-0000-0000-0000-000000000002','Quota Two'),
 ('fc200000-0000-0000-0000-000000000003','fc000000-0000-0000-0000-000000000003','Quota Three'),
 ('fc200000-0000-0000-0000-000000000004','fc000000-0000-0000-0000-000000000004','Quota Inactive');
insert into public.community_members(community_id,profile_id,role,active) values
 ('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000001','owner',true),
 ('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000002','member',true),
 ('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000003','member',true),
 ('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000004','member',false);

select lives_ok($test$do $block$ begin for i in 1..5 loop perform public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000001'); end loop; end $block$$test$,'profile accepts exactly five requests per five minutes');
select is((select request_count from public.ai_rate_limit_windows where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000001'),5,'profile five-minute counter reaches five');
select is((select request_count from public.ai_rate_limit_windows where scope='community' and scope_id='fc100000-0000-0000-0000-000000000001'),5,'community five-minute counter increments with accepted claims');
select is((select generation_count from public.ai_generation_daily_quotas where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000001'),5,'profile daily counter increments with accepted claims');
select is((select generation_count from public.ai_generation_daily_quotas where scope='community' and scope_id='fc100000-0000-0000-0000-000000000001'),5,'community daily counter increments with accepted claims');
select throws_ok($$select public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000001')$$,'AI010',null,'sixth profile request is rejected');
select ok(
  (select request_count=5 from public.ai_rate_limit_windows where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000001')
  and (select request_count=5 from public.ai_rate_limit_windows where scope='community' and scope_id='fc100000-0000-0000-0000-000000000001')
  and (select generation_count=5 from public.ai_generation_daily_quotas where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000001')
  and (select generation_count=5 from public.ai_generation_daily_quotas where scope='community' and scope_id='fc100000-0000-0000-0000-000000000001'),
  'rejected five-minute claim rolls back all four counters'
);

delete from public.ai_rate_limit_windows;
delete from public.ai_generation_daily_quotas;
insert into public.ai_rate_limit_windows values ('community','fc100000-0000-0000-0000-000000000001',date_bin('5 minutes',now(),timestamptz '2000-01-01'),19);
select lives_ok($$select public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000002')$$,'twentieth community request is accepted');
select throws_ok($$select public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000003')$$,'AI010',null,'twenty-first community request is rejected');
select ok(
  not exists(select 1 from public.ai_rate_limit_windows where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000003')
  and not exists(select 1 from public.ai_generation_daily_quotas where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000003'),
  'community rejection atomically rolls back the new profile counters'
);

delete from public.ai_rate_limit_windows;
delete from public.ai_generation_daily_quotas;
insert into public.ai_generation_daily_quotas values ('profile','fc200000-0000-0000-0000-000000000001',(now() at time zone 'UTC')::date,24);
select lives_ok($$select public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000001')$$,'twenty-fifth profile daily generation is accepted');
select throws_ok($$select public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000001')$$,'AI010',null,'twenty-sixth profile daily generation is rejected');
select ok(
  (select generation_count=25 from public.ai_generation_daily_quotas where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000001')
  and (select request_count=1 from public.ai_rate_limit_windows where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000001')
  and (select generation_count=1 from public.ai_generation_daily_quotas where scope='community' and scope_id='fc100000-0000-0000-0000-000000000001'),
  'profile daily rejection rolls back burst and community counters'
);

delete from public.ai_rate_limit_windows;
delete from public.ai_generation_daily_quotas;
insert into public.ai_generation_daily_quotas values ('community','fc100000-0000-0000-0000-000000000001',(now() at time zone 'UTC')::date,99);
select lives_ok($$select public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000002')$$,'one-hundredth community daily generation is accepted');
select throws_ok($$select public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000003')$$,'AI010',null,'one-hundred-first community daily generation is rejected');
select ok(
  not exists(select 1 from public.ai_rate_limit_windows where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000003')
  and not exists(select 1 from public.ai_generation_daily_quotas where scope='profile' and scope_id='fc200000-0000-0000-0000-000000000003')
  and (select generation_count=100 from public.ai_generation_daily_quotas where scope='community' and scope_id='fc100000-0000-0000-0000-000000000001'),
  'community daily rejection atomically rolls back preceding counters'
);

select throws_ok($$select public.claim_project_ai_request('fc100000-0000-0000-0000-000000000001','fc200000-0000-0000-0000-000000000004')$$,'AI009',null,'inactive member is rejected before quota mutation');
select is((select count(*)::integer from public.ai_rate_limit_windows where scope_id='fc200000-0000-0000-0000-000000000004'),0,'inactive profile creates no burst counter');
select is((select count(*)::integer from public.ai_generation_daily_quotas where scope_id='fc200000-0000-0000-0000-000000000004'),0,'inactive profile creates no daily counter');
select matches(pg_get_functiondef('public.claim_project_ai_request(uuid,uuid)'::regprocedure),'on conflict \(scope, scope_id, window_started_at\)','burst counters use atomic conflict updates');
select matches(pg_get_functiondef('public.claim_project_ai_request(uuid,uuid)'::regprocedure),'on conflict \(scope, scope_id, quota_date\)','daily counters use atomic conflict updates');
select matches(pg_get_functiondef('public.claim_project_ai_request(uuid,uuid)'::regprocedure),'at time zone ''UTC''','daily quota boundary is UTC');

select * from finish();
rollback;
