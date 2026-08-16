begin;
select plan(12);

select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('tasks','events','line_messages','ai_conversation_sessions','ai_conversation_messages','ai_proposal_executions')),'all user and AI execution tables keep RLS enabled');
select ok(not has_function_privilege('public','public.execute_ai_proposal(uuid,uuid)','execute'),'PUBLIC cannot execute proposal RPC');
select ok(not has_function_privilege('anon','public.execute_ai_proposal(uuid,uuid)','execute'),'anon cannot execute proposal RPC');
select ok(not has_function_privilege('authenticated','public.execute_ai_proposal(uuid,uuid)','execute'),'authenticated cannot execute proposal RPC directly');
select ok(has_function_privilege('service_role','public.execute_ai_proposal(uuid,uuid)','execute'),'service_role retains proposal RPC execution');
select ok(not has_function_privilege('public','public.claim_project_ai_request(uuid,uuid)','execute') and not has_function_privilege('authenticated','public.claim_project_ai_request(uuid,uuid)','execute'),'AI rate-limit claim is service-only');
select ok(has_function_privilege('authenticated','public.review_ai_proposal(uuid,text)','execute'),'authenticated retains explicit human review RPC');
select ok(not has_table_privilege('anon','public.tasks','select') and not has_table_privilege('anon','public.events','select') and not has_table_privilege('anon','public.line_messages','select'),'anon has no workspace read grants');
select ok(not has_table_privilege('authenticated','public.ai_proposal_executions','insert') and not has_table_privilege('authenticated','public.ai_proposal_executions','update'),'browser cannot write executor audit rows');
select ok((select coalesce(array_to_string(proconfig,','),'') like '%search_path=public, pg_temp%' from pg_proc where oid='public.execute_ai_proposal(uuid,uuid)'::regprocedure),'executor SECURITY DEFINER pins search_path');
select ok((select coalesce(array_to_string(proconfig,','),'') like '%search_path=public, pg_temp%' from pg_proc where oid='public.review_ai_proposal(uuid,text)'::regprocedure),'review SECURITY DEFINER pins search_path');
select ok(not exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a where a.grantee=0 and a.privilege_type in ('INSERT','UPDATE','DELETE')),'default privileges do not grant PUBLIC mutation rights');

select * from finish();
rollback;
