-- Production AI cost guard: tighter burst limits plus UTC daily generation quotas.
-- All four counters are claimed in one transaction. If any limit is exceeded,
-- the exception rolls back every increment made by this invocation.

create table public.ai_generation_daily_quotas (
  scope text not null check (scope in ('profile', 'community')),
  scope_id uuid not null,
  quota_date date not null,
  generation_count integer not null check (generation_count > 0),
  primary key (scope, scope_id, quota_date)
);

revoke all on table public.ai_generation_daily_quotas from public, anon, authenticated, service_role;

create or replace function public.claim_project_ai_request(p_community_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := date_bin('5 minutes', now(), timestamptz '2000-01-01');
  v_quota_date date := (now() at time zone 'UTC')::date;
  v_count integer;
begin
  if not exists (
    select 1
    from public.community_members
    where community_id = p_community_id
      and profile_id = p_profile_id
      and active
  ) then
    raise exception 'inactive member' using errcode = 'AI009';
  end if;

  insert into public.ai_rate_limit_windows(scope, scope_id, window_started_at, request_count)
  values ('profile', p_profile_id, v_window, 1)
  on conflict (scope, scope_id, window_started_at)
  do update set request_count = public.ai_rate_limit_windows.request_count + 1
  returning request_count into v_count;
  if v_count > 5 then
    raise exception 'profile five-minute generation quota' using errcode = 'AI010';
  end if;

  insert into public.ai_rate_limit_windows(scope, scope_id, window_started_at, request_count)
  values ('community', p_community_id, v_window, 1)
  on conflict (scope, scope_id, window_started_at)
  do update set request_count = public.ai_rate_limit_windows.request_count + 1
  returning request_count into v_count;
  if v_count > 20 then
    raise exception 'community five-minute generation quota' using errcode = 'AI010';
  end if;

  insert into public.ai_generation_daily_quotas(scope, scope_id, quota_date, generation_count)
  values ('profile', p_profile_id, v_quota_date, 1)
  on conflict (scope, scope_id, quota_date)
  do update set generation_count = public.ai_generation_daily_quotas.generation_count + 1
  returning generation_count into v_count;
  if v_count > 25 then
    raise exception 'profile daily generation quota' using errcode = 'AI010';
  end if;

  insert into public.ai_generation_daily_quotas(scope, scope_id, quota_date, generation_count)
  values ('community', p_community_id, v_quota_date, 1)
  on conflict (scope, scope_id, quota_date)
  do update set generation_count = public.ai_generation_daily_quotas.generation_count + 1
  returning generation_count into v_count;
  if v_count > 100 then
    raise exception 'community daily generation quota' using errcode = 'AI010';
  end if;

  delete from public.ai_rate_limit_windows
  where window_started_at < now() - interval '1 day';
  delete from public.ai_generation_daily_quotas
  where quota_date < v_quota_date - 2;
end
$$;

revoke all on function public.claim_project_ai_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_project_ai_request(uuid, uuid) to service_role;
