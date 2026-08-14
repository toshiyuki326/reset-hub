# Sprint 7 Threat Model — Approved Proposal Executor

Written before implementation, per the Sprint 7 instruction. Each row is an attack vector from
the sprint doc, the mechanism that stops it, and where that mechanism lives.

| # | Attack vector | Mitigation | Enforced in |
|---|---|---|---|
| 1 | Browser executes an unapproved proposal | `execute_ai_proposal()` re-selects the message row `for update` and requires `proposal_status='approved'`; any other status raises `NOT_APPROVED` before any write happens | migration 006 SQL function |
| 2 | Browser executes a rejected proposal | Same check as #1 — `rejected` is not `approved`, so it is rejected identically | migration 006 SQL function |
| 3 | `approved_by` spoofed by the client | Executor never accepts `approved_by`/`profile_id`/`community_id` from the request body. `execute-ai-proposal` derives the caller's profile solely from `admin.auth.getUser(jwt)`, and the SQL function re-derives `approved_by` from the stored row, not from any parameter | Edge Function `index.ts` + SQL function |
| 4 | Attacker executes another user's session/message | SQL function requires `session.profile_id = caller_profile_id` (mirrors `review_ai_proposal`'s existing ownership check) | migration 006 SQL function |
| 5 | Cross-community task update | `community_id` is re-derived server-side from the message row, never taken from the client. `update_task`'s target task is loaded and its `community_id` compared to the proposal's `community_id`; mismatch raises `COMMUNITY_MISMATCH` | migration 006 SQL function |
| 6 | Proposal JSON edited after approval, then executed | BEFORE UPDATE trigger `ai_conversation_messages_protect_approved_proposal` raises `PROPOSAL_IMMUTABLE` on any attempt to change the `proposal` column once `proposal_status` has left `proposal`/`review` — enforced independently of which role/function performs the UPDATE, including service role | migration 006 trigger |
| 7 | Same proposal executed twice (double execution) | `SELECT ... FOR UPDATE` row lock + `proposal_status='approved'` precondition inside one transaction. Second concurrent caller blocks on the lock, then sees `executing`/`executed` and is rejected with `ALREADY_EXECUTING`/`ALREADY_EXECUTED`. A partial unique index on `ai_proposal_executions(message_id) where status='executing'` gives a second, independent DB-level guarantee | migration 006 row lock + partial unique index |
| 8 | Race condition from simultaneous requests | Same as #7 — Postgres row lock serializes concurrent claims; there is no window where two transactions both observe `approved` | migration 006 row lock |
| 9 | Unknown action kind in `actions[]` | SQL function only recognizes `create_task`/`update_task`; anything else (including the proposal-only kinds `create_goal`/`update_goal`/`create_event`) raises `UNSUPPORTED_ACTION` and aborts the whole transaction (no partial execution) | migration 006 SQL function |
| 10 | Malformed payload (wrong types, missing fields, oversized strings) | Two layers: Zod schema in `taskExecutor.ts` rejects the request shape before the RPC call; the SQL function independently re-validates column-level constraints (`length(title)<=160`, enum casts for `status`/`priority`, uuid casts for `assignee_id`) — invalid values raise `INVALID_ACTION` rather than a raw Postgres error reaching the client | Edge Function schema.ts/taskExecutor.ts + SQL function |
| 11 | Inactive member executes | `community_members.active=true` is re-checked inside the SQL function (`is_active_member`-equivalent inline check), independent of RLS since the function runs as SECURITY DEFINER | migration 006 SQL function |
| 12 | Operation not permitted for `member` role | `update_task` requires the caller to be `owner`/`admin`, or the task's `created_by`, or its `assignee_id` — mirrors the existing `tasks_update` RLS policy exactly, re-implemented explicitly because SECURITY DEFINER bypasses RLS | migration 006 SQL function |
| 13 | Partial execution (some actions in a multi-action proposal succeed, others fail) | All actions in one proposal run inside the single transaction of one function call. Any failure raises an exception, which rolls back every write made so far in that call, including earlier actions in the same proposal | migration 006 SQL function (transaction semantics) |
| 14 | Executor response leaks internal SQL/DB detail | Edge Function maps every Postgres error to one of a fixed safe-error-code enum (`errorCodes.ts`) and returns only `{error,code,message}` with a generic Japanese message; raw `error.message`/`error.detail`/`error.hint` are logged server-side only, never returned to the client | Edge Function `executor.ts` |
| 15 | Process crashes right after claiming, before the task write completes (added requirement A) | Claim (`approved→executing`) and the `create_task`/`update_task` write happen in the same statement-sequence of one SQL function invoked through one RPC call, which Postgres always executes as a single transaction. A crash/exception before `COMMIT` rolls back the claim along with everything else, so the row is left `approved`, not stuck `executing` | migration 006 SQL function (single transaction, no cross-call state) |

## Design consequence of #15

A stateless Edge Function calling `supabase-js` cannot span one Postgres transaction across two
separate REST/RPC calls — each `.rpc()`/`.from()` call is its own transaction. The only way to
guarantee "claim and write happen atomically, and a mid-flight crash rolls back the claim" from
this stack (without introducing a raw direct-Postgres connection and a new `SUPABASE_DB_URL`
secret, which the existing codebase's RPC-based patterns — `bootstrap_current_user`,
`convert_line_message_to_task`, `review_ai_proposal` — never require) is to put the whole
claim+validate+write+audit sequence inside **one** `SECURITY DEFINER` PL/pgSQL function, invoked
through **one** `.rpc()` call. That is the architecture migration 006 and `executor.ts` implement.

Recording a terminal `failed` status (distinct from "rolled back to approved, safe to retry") is
therefore a **second, separate** RPC call (`mark_ai_proposal_failed`), made only for error codes
the Edge Function classifies as non-retryable (`UNSUPPORTED_ACTION`, `INVALID_ACTION`,
`TARGET_NOT_FOUND`, `COMMUNITY_MISMATCH`, `PERMISSION_DENIED`). It re-validates authorization and
current status from scratch and never touches task data, matching the sprint doc's "small
separate transaction for recording failure only" guidance.
