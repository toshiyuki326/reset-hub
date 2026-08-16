-- Tables created by migrations run as `postgres` do not inherit the
-- `supabase_admin` default privileges. Grant only the API operations backed by
-- the RLS policies in migration 004. Message UPDATE remains server-only as
-- required by migration 005; proposal review goes through review_ai_proposal().
revoke all on table
  public.profiles,
  public.community_members,
  public.project_goals,
  public.project_kpis,
  public.project_kpi_entries,
  public.ai_conversation_sessions,
  public.ai_conversation_messages,
  public.ai_usage_events
from anon, authenticated, service_role;

-- Project AI ownership policies resolve the caller's profile and membership
-- through these RLS-protected foundation tables.
grant select on table
  public.profiles,
  public.community_members
to authenticated;

grant select, insert, update, delete on table
  public.project_goals,
  public.project_kpis,
  public.ai_conversation_sessions
to authenticated;

grant select, insert on table
  public.project_kpi_entries,
  public.ai_usage_events
to authenticated;

grant select, insert, delete on table
  public.ai_conversation_messages
to authenticated;

grant all on table
  public.profiles,
  public.community_members,
  public.project_goals,
  public.project_kpis,
  public.project_kpi_entries,
  public.ai_conversation_sessions,
  public.ai_conversation_messages,
  public.ai_usage_events
to service_role;
