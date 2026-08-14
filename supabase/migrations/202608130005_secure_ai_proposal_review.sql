-- Human review is the only client-side state transition for AI proposals.
-- Execution is intentionally unavailable to authenticated browser clients.
revoke update on public.ai_conversation_messages from authenticated;

create or replace function public.review_ai_proposal(
  p_message_id uuid,
  p_decision text
) returns public.ai_conversation_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message public.ai_conversation_messages%rowtype;
  v_profile_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid proposal decision' using errcode = '22023';
  end if;

  select p.id into v_profile_id
    from public.profiles as p
   where p.auth_user_id = auth.uid();

  select m.* into v_message
    from public.ai_conversation_messages as m
    join public.ai_conversation_sessions as s on s.id = m.session_id
   where m.id = p_message_id
     and s.profile_id = v_profile_id
     and s.community_id = m.community_id
     and public.is_active_member(m.community_id)
   for update of m;

  if v_message.id is null then
    raise exception 'proposal not found' using errcode = '42501';
  end if;
  if v_message.proposal is null or v_message.proposal_status not in ('proposal', 'review') then
    raise exception 'proposal is not reviewable' using errcode = '55000';
  end if;

  update public.ai_conversation_messages
     set proposal_status = p_decision::public.ai_proposal_status,
         approved_by = case when p_decision = 'approved' then v_profile_id else null end,
         approved_at = case when p_decision = 'approved' then now() else null end
   where id = p_message_id
   returning * into v_message;

  return v_message;
end
$$;

revoke all on function public.review_ai_proposal(uuid,text) from public, anon;
grant execute on function public.review_ai_proposal(uuid,text) to authenticated;
