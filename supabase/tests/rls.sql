begin;
-- Run with `supabase test db`; pgTAP assertions use JWT claims and seeded auth users in CI.
select plan(7);
select has_table('public','community_invitations','invitations exist');
select has_table('public','google_oauth_states','server-side oauth states exist');
select row_security_active('public','tasks','tasks RLS active');
select row_security_active('public','events','events RLS active');
select row_security_active('public','line_messages','line inbox RLS active');
select row_security_active('public','event_members','event membership RLS active');
select row_security_active('public','google_connections','Google connections RLS active');
select * from finish();rollback;
