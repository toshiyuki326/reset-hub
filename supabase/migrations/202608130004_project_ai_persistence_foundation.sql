create type public.goal_status as enum ('draft','active','completed','cancelled');
create type public.kpi_value_type as enum ('number','percentage','currency','count');
create type public.ai_session_status as enum ('active','archived');
create type public.ai_message_role as enum ('user','assistant','system');
create type public.ai_proposal_status as enum ('none','proposal','review','approved','rejected','executed','failed');

create table public.project_goals(
 id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities on delete cascade,
 title text not null check(length(title) between 1 and 160),description text not null default '',status public.goal_status not null default 'draft',
 owner_id uuid references public.community_members on delete set null,target_date date,created_by uuid not null references public.profiles,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,community_id)
);
create table public.project_kpis(
 id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities on delete cascade,
 goal_id uuid not null,name text not null check(length(name) between 1 and 120),
 description text not null default '',unit text not null default '',value_type public.kpi_value_type not null default 'number',target_value numeric,
 created_by uuid not null references public.profiles,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(goal_id,name),unique(id,community_id),foreign key(goal_id,community_id) references public.project_goals(id,community_id) on delete cascade
);
create table public.project_kpi_entries(
 id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities on delete cascade,
 kpi_id uuid not null,value numeric not null,recorded_at timestamptz not null default now(),
 note text not null default '',created_by uuid not null references public.profiles,created_at timestamptz not null default now(),foreign key(kpi_id,community_id) references public.project_kpis(id,community_id) on delete cascade
);
create table public.ai_conversation_sessions(
 id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities on delete cascade,
 profile_id uuid not null references public.profiles on delete cascade,goal_id uuid,
 title text not null default 'New conversation' check(length(title)<=160),status public.ai_session_status not null default 'active',
 context_snapshot jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(id,community_id),foreign key(goal_id,community_id) references public.project_goals(id,community_id)
);
create table public.ai_conversation_messages(
 id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities on delete cascade,
 session_id uuid not null,role public.ai_message_role not null,content text not null,
 reasoning_summary text,proposal jsonb,proposal_status public.ai_proposal_status not null default 'none',approved_by uuid references public.profiles,
 approved_at timestamptz,executed_at timestamptz,created_at timestamptz not null default now(),
 check((proposal_status not in ('approved','executed')) or approved_by is not null),foreign key(session_id,community_id) references public.ai_conversation_sessions(id,community_id) on delete cascade
);
create table public.ai_usage_events(
 id uuid primary key default gen_random_uuid(),community_id uuid not null references public.communities on delete cascade,
 profile_id uuid not null references public.profiles on delete cascade,session_id uuid references public.ai_conversation_sessions on delete set null,
 provider text not null,model text not null,operation text not null,input_units integer not null default 0 check(input_units>=0),
 output_units integer not null default 0 check(output_units>=0),metadata jsonb not null default '{}',created_at timestamptz not null default now()
);
create index project_goals_community_status_idx on public.project_goals(community_id,status);
create index project_kpis_goal_idx on public.project_kpis(goal_id);
create index project_kpi_entries_kpi_recorded_idx on public.project_kpi_entries(kpi_id,recorded_at desc);
create index ai_sessions_community_profile_idx on public.ai_conversation_sessions(community_id,profile_id,updated_at desc);
create index ai_messages_session_created_idx on public.ai_conversation_messages(session_id,created_at);
create index ai_usage_community_created_idx on public.ai_usage_events(community_id,created_at desc);
alter table public.project_goals enable row level security;alter table public.project_kpis enable row level security;
alter table public.project_kpi_entries enable row level security;alter table public.ai_conversation_sessions enable row level security;
alter table public.ai_conversation_messages enable row level security;alter table public.ai_usage_events enable row level security;
create policy goals_read on public.project_goals for select using(public.is_active_member(community_id));
create policy goals_write on public.project_goals for all using(public.current_user_community_role(community_id) in ('owner','admin')) with check(public.current_user_community_role(community_id) in ('owner','admin'));
create policy kpis_read on public.project_kpis for select using(public.is_active_member(community_id));
create policy kpis_write on public.project_kpis for all using(public.current_user_community_role(community_id) in ('owner','admin')) with check(public.current_user_community_role(community_id) in ('owner','admin'));
create policy kpi_entries_read on public.project_kpi_entries for select using(public.is_active_member(community_id));
create policy kpi_entries_insert on public.project_kpi_entries for insert with check(public.is_active_member(community_id));
create policy ai_sessions_own on public.ai_conversation_sessions for all using(public.is_active_member(community_id) and profile_id=(select id from public.profiles where auth_user_id=auth.uid())) with check(public.is_active_member(community_id) and profile_id=(select id from public.profiles where auth_user_id=auth.uid()));
create policy ai_messages_own on public.ai_conversation_messages for all using(exists(select 1 from public.ai_conversation_sessions s where s.id=session_id and s.profile_id=(select id from public.profiles where auth_user_id=auth.uid()) and public.is_active_member(s.community_id))) with check(exists(select 1 from public.ai_conversation_sessions s where s.id=session_id and s.profile_id=(select id from public.profiles where auth_user_id=auth.uid()) and s.community_id=ai_conversation_messages.community_id));
create policy ai_usage_own_read on public.ai_usage_events for select using(public.is_active_member(community_id) and profile_id=(select id from public.profiles where auth_user_id=auth.uid()));
create policy ai_usage_own_insert on public.ai_usage_events for insert with check(public.is_active_member(community_id) and profile_id=(select id from public.profiles where auth_user_id=auth.uid()));
