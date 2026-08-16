begin;
select plan(26);
select has_table('public','ai_rate_limit_windows','DB-backed AI rate limit table exists');
select ok(not has_function_privilege('authenticated','public.claim_project_ai_request(uuid,uuid)','execute'),'browser cannot claim an AI rate-limit slot directly');
select ok(not has_table_privilege('service_role','public.ai_rate_limit_windows','select'),'service role cannot bypass the rate-limit RPC with direct table access');

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
 ('fd000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rc-owner@example.invalid','',now(),'{}','{}',now(),now()),
 ('fd000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rc-member@example.invalid','',now(),'{}','{}',now(),now()),
 ('fd000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rc-inactive@example.invalid','',now(),'{}','{}',now(),now());
insert into public.communities(id,name,slug) values
 ('fd100000-0000-0000-0000-000000000001','RC A','rc-a-fd10'),('fd100000-0000-0000-0000-000000000002','RC B','rc-b-fd10');
insert into public.profiles(id,auth_user_id,display_name) values
 ('fd200000-0000-0000-0000-000000000001','fd000000-0000-0000-0000-000000000001','Owner'),
 ('fd200000-0000-0000-0000-000000000002','fd000000-0000-0000-0000-000000000002','Member'),
 ('fd200000-0000-0000-0000-000000000003','fd000000-0000-0000-0000-000000000003','Inactive');
insert into public.community_members(community_id,profile_id,role,active) values
 ('fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000001','owner',true),
 ('fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000002','member',true),
 ('fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000003','member',false);
insert into public.project_goals(id,community_id,title,status,created_by) values
 ('fd300000-0000-0000-0000-000000000001','fd100000-0000-0000-0000-000000000001','Goal A','draft','fd200000-0000-0000-0000-000000000001'),
 ('fd300000-0000-0000-0000-000000000002','fd100000-0000-0000-0000-000000000002','Goal B','draft','fd200000-0000-0000-0000-000000000001');
insert into public.ai_conversation_sessions(id,community_id,profile_id,title) values
 ('fd400000-0000-0000-0000-000000000001','fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000001','Owner session'),
 ('fd400000-0000-0000-0000-000000000002','fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000002','Member session');

insert into public.ai_conversation_messages(id,community_id,session_id,role,content,proposal,proposal_status,approved_by,approved_at) values
 ('fd500000-0000-0000-0000-000000000001','fd100000-0000-0000-0000-000000000001','fd400000-0000-0000-0000-000000000001','assistant','create goal','{"actions":[{"kind":"create_goal","target":"goal","payload":{"title":"New Goal","description":"d","status":"active","target_date":"2026-12-31"}}]}','approved','fd200000-0000-0000-0000-000000000001',now()),
 ('fd500000-0000-0000-0000-000000000002','fd100000-0000-0000-0000-000000000001','fd400000-0000-0000-0000-000000000001','assistant','update goal','{"actions":[{"kind":"update_goal","target":"fd300000-0000-0000-0000-000000000001","payload":{"title":null,"description":null,"status":"completed","target_date":"2027-01-31"}}]}','approved','fd200000-0000-0000-0000-000000000001',now()),
 ('fd500000-0000-0000-0000-000000000003','fd100000-0000-0000-0000-000000000001','fd400000-0000-0000-0000-000000000001','assistant','create event','{"actions":[{"kind":"create_event","target":"event","payload":{"title":"RC Event","description":"d","location":"Tokyo","start_at":"2026-09-01T10:00:00+09:00","end_at":"2026-09-01T11:00:00+09:00","all_day":false}}]}','approved','fd200000-0000-0000-0000-000000000001',now()),
 ('fd500000-0000-0000-0000-000000000004','fd100000-0000-0000-0000-000000000001','fd400000-0000-0000-0000-000000000002','assistant','member goal','{"actions":[{"kind":"create_goal","target":"goal","payload":{"title":"Denied","description":null,"status":null,"target_date":null}}]}','approved','fd200000-0000-0000-0000-000000000002',now()),
 ('fd500000-0000-0000-0000-000000000005','fd100000-0000-0000-0000-000000000001','fd400000-0000-0000-0000-000000000001','assistant','unapproved','{"actions":[{"kind":"create_task","target":"task","payload":{"title":"No","description":null,"status":null,"priority":null,"assignee_id":null,"due_date":null}}]}','proposal',null,null),
 ('fd500000-0000-0000-0000-000000000006','fd100000-0000-0000-0000-000000000001','fd400000-0000-0000-0000-000000000001','assistant','rejected','{"actions":[{"kind":"create_task","target":"task","payload":{"title":"No","description":null,"status":null,"priority":null,"assignee_id":null,"due_date":null}}]}','rejected',null,null),
 ('fd500000-0000-0000-0000-000000000007','fd100000-0000-0000-0000-000000000001','fd400000-0000-0000-0000-000000000001','assistant','cross goal','{"actions":[{"kind":"update_goal","target":"fd300000-0000-0000-0000-000000000002","payload":{"title":"Cross","description":null,"status":null,"target_date":null}}]}','approved','fd200000-0000-0000-0000-000000000001',now());

select lives_ok($$select public.execute_ai_proposal('fd500000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000001')$$,'owner creates goal');
select is((select count(*)::int from public.project_goals where community_id='fd100000-0000-0000-0000-000000000001' and title='New Goal'),1,'goal created in proposal community');
select is((select target_date::text from public.project_goals where community_id='fd100000-0000-0000-0000-000000000001' and title='New Goal'),'2026-12-31','goal target_date is persisted semantically');
select is((select action_kinds from public.ai_proposal_executions where message_id='fd500000-0000-0000-0000-000000000001'),array['create_goal']::text[],'goal action audited');
select lives_ok($$select public.execute_ai_proposal('fd500000-0000-0000-0000-000000000002','fd200000-0000-0000-0000-000000000001')$$,'owner updates goal');
select is((select status::text from public.project_goals where id='fd300000-0000-0000-0000-000000000001'),'completed','goal update persisted');
select is((select target_date::text from public.project_goals where id='fd300000-0000-0000-0000-000000000001'),'2027-01-31','goal target_date update persisted semantically');
select lives_ok($$select public.execute_ai_proposal('fd500000-0000-0000-0000-000000000003','fd200000-0000-0000-0000-000000000001')$$,'owner creates event');
select is((select count(*)::int from public.events where community_id='fd100000-0000-0000-0000-000000000001' and title='RC Event'),1,'event created internally without external sync');
select is((select start_at from public.events where community_id='fd100000-0000-0000-0000-000000000001' and title='RC Event'),timestamptz '2026-09-01T10:00:00+09:00','event start_at preserves the instant');
select is((select end_at from public.events where community_id='fd100000-0000-0000-0000-000000000001' and title='RC Event'),timestamptz '2026-09-01T11:00:00+09:00','event end_at preserves the instant');
select is((select all_day from public.events where community_id='fd100000-0000-0000-0000-000000000001' and title='RC Event'),false,'event all_day persists semantically');
select is((select location from public.events where community_id='fd100000-0000-0000-0000-000000000001' and title='RC Event'),'Tokyo','event location persists semantically');
select throws_ok($$select public.execute_ai_proposal('fd500000-0000-0000-0000-000000000004','fd200000-0000-0000-0000-000000000002')$$,'AI008',null,'normal member cannot create goal');
select is((select proposal_status::text from public.ai_conversation_messages where id='fd500000-0000-0000-0000-000000000004'),'approved','denied action rolls claim back');
select throws_ok($$select public.execute_ai_proposal('fd500000-0000-0000-0000-000000000005','fd200000-0000-0000-0000-000000000001')$$,'AI001',null,'unapproved proposal denied');
select throws_ok($$select public.execute_ai_proposal('fd500000-0000-0000-0000-000000000006','fd200000-0000-0000-0000-000000000001')$$,'AI001',null,'rejected proposal denied');
select throws_ok($$select public.execute_ai_proposal('ffffffff-ffff-ffff-ffff-ffffffffffff','fd200000-0000-0000-0000-000000000001')$$,'AI008',null,'forged message id denied');
select throws_ok($$select public.execute_ai_proposal('fd500000-0000-0000-0000-000000000007','fd200000-0000-0000-0000-000000000001')$$,'AI007',null,'cross-community goal update denied');
select is((select proposal_status::text from public.ai_conversation_messages where id='fd500000-0000-0000-0000-000000000007'),'approved','cross-community denial rolls back');
select lives_ok($test$do $block$ begin for i in 1..10 loop perform public.claim_project_ai_request('fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000001'); end loop; end $block$$test$,'first ten profile requests accepted');
select throws_ok($$select public.claim_project_ai_request('fd100000-0000-0000-0000-000000000001','fd200000-0000-0000-0000-000000000001')$$,'AI010',null,'eleventh profile request rate limited');
select is((select request_count from public.ai_rate_limit_windows where scope='profile' and scope_id='fd200000-0000-0000-0000-000000000001'),10,'rejected rate claim is rolled back');
select * from finish();
rollback;
