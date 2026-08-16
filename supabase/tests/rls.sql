begin;
-- Run with `supabase test db`; pgTAP assertions use JWT claims and seeded auth users in CI.
select plan(7);
select has_table('public','community_invitations','invitations exist');
select has_table('public','google_oauth_states','server-side oauth states exist');
select ok((select relrowsecurity from pg_class where oid = 'public.tasks'::regclass),'tasks RLS active');
select ok((select relrowsecurity from pg_class where oid = 'public.events'::regclass),'events RLS active');
select ok((select relrowsecurity from pg_class where oid = 'public.line_messages'::regclass),'line inbox RLS active');
select ok((select relrowsecurity from pg_class where oid = 'public.event_members'::regclass),'event membership RLS active');
select ok((select relrowsecurity from pg_class where oid = 'public.google_connections'::regclass),'Google connections RLS active');
select * from finish();rollback;
