insert into public.communities(name,slug) values('reset','reset') on conflict do nothing;
-- Auth-backed profiles are created after `supabase auth` users exist. App fixtures include Owner/Admin/Member, events and tasks for zero-config UI development.
