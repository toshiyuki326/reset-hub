# Release Candidate Security

## Trust boundaries

- Browser: supplies session/message text or an executor `message_id`; never supplies trusted community/profile IDs to execution.
- Chat Edge Function: verifies JWT, session ownership and active membership and may only persist messages/proposals/usage.
- Review RPC: the only authenticated proposal-status mutation path.
- Executor Edge Function: repeats identity checks and calls a service-only RPC.
- Database executor: authoritative authorization, row lock, fixed action dispatch, transaction and audit boundary.

## Database controls

- RLS is enabled on tenant data and tests inspect `pg_class.relrowsecurity` directly.
- `ai_conversation_messages` UPDATE is not granted to `authenticated`.
- Approved/rejected/executing/executed/failed proposal payloads are immutable through a trigger.
- Executor, failure-recording and rate-limit RPCs revoke PUBLIC/anon/authenticated execution and grant only `service_role` where applicable.
- SECURITY DEFINER functions pin `search_path`; production functions are owned by `postgres` in the local reference stack.
- Cross-community IDs are rechecked inside SECURITY DEFINER functions instead of relying on RLS bypass behavior.
- A message row lock plus a partial unique audit index prevent duplicate execution.

## AI/provider controls

- Strict JSON Schema plus Zod validation; five action kinds only.
- 4,000-character message and 16 KB HTTP body limits.
- Atomic limits: 10 requests/profile/5 minutes and 50 requests/community/5 minutes.
- 30,000-character context, 20-message history and 1,200-output-token limits.
- 20-second attempt timeout and at most one retry; provider 429 is not retried.
- Usage/failure codes are logged without API keys, JWTs, full prompts or raw provider/database errors.

## Adversarial coverage

Local pgTAP/Deno/Vitest cover anonymous/browser denial, inactive/member/admin/owner boundaries, other session/community, unapproved/rejected/approved/executed/failed states, immutable payloads, forged IDs, duplicate/concurrent execution, rollback and audit integrity.
