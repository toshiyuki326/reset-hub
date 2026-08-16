-- Restore only the browser reads required by loadWorkspace() embedded resources.
-- Migration 008 intentionally revoked all foundation-table privileges, but its
-- authenticated allowlist omitted these two RLS-protected relations.
revoke all on table public.event_members, public.line_users from anon;
grant select on table public.event_members, public.line_users to authenticated;

