# Sprint 4.1 / 4.2 / 5 Implementation Notes

- Existing Auth, Owner bootstrap, Dashboard, LINE and Google integrations were preserved.
- No ProjectAiChat existed before Sprint 4/5; the decomposed controller/panels are now connected at the authenticated `/project-ai` route without changing the Dashboard.
- Document has no database table in the approved schema; its shared contract was added without inventing persistence.
- Context Builder is deterministic when supplied a timestamp and never writes to DB/localStorage.
- Conversation repositories persist through Supabase RLS. No AI provider SDK or automatic external write was added.
- Staging inspection confirmed migrations 001-004 and all six 004 tables. Remote pgTAP execution could not start because the Supabase CLI test runner requires Docker on this host. The rollback-only transaction is included at `supabase/tests/project_ai_staging.sql` for CI or a Docker-enabled machine.
- Review found that 004 allowed a session owner to directly mark a proposal executed when supplying `approved_by`. Migration 005 closes that browser path and must be reviewed/applied before deploying the Project AI UI.
- Migration `202608130005_secure_ai_proposal_review.sql` was already applied to staging before Sprint 6; Sprint 6 adds no migration and performs no remote mutation.

## Sprint 6

- Added `project-ai-chat`, a JWT-protected Supabase Edge Function using the OpenAI Responses API over HTTPS.
- Added strict structured responses, safe usage logging and generic frontend errors.
- The Function reconstructs community-scoped Context from DB state and never trusts a browser community/profile value.
- `/project-ai` is route-level lazy loaded.
- No migration or executor was added. Task, Goal and Event tables remain read-only to the AI flow.

## Sprint 7: Approved Proposal Executor Foundation

- Added migration `202608130006_ai_proposal_execution_foundation.sql`: `executing` proposal state, execution bookkeeping columns, a trigger making the proposal payload immutable once approved (independent of any API), the `ai_proposal_executions` audit table with a partial unique index preventing two concurrent executions of the same proposal, and two service-role-only functions (`execute_ai_proposal`, `mark_ai_proposal_failed`).
- Added the `execute-ai-proposal` Edge Function. It only ever receives `message_id` from the browser; community/profile/session are re-derived and re-validated server-side, then the entire claim+write+audit sequence runs inside one RPC call so it is one Postgres transaction — a failure anywhere in it rolls the proposal back to `approved` automatically (no code path needs to "undo" a claim).
- Added a second, independent RPC (`mark_ai_proposal_failed`) used only for non-retryable errors, in its own small transaction, never touching task data — matching the sprint doc's explicit requirement that claim and task-write share one transaction while permanent-failure recording is allowed to be separate.
- Frontend: `ExecutionPanel` shows the execute button only for `approved` proposals, requires an explicit inline confirmation before calling `executeProjectAiProposal`, and never auto-executes after approval (`review` and `execute` remain two separate user actions).
- `create_task`/`update_task` are the only two action kinds actually executed. A proposal mixing them with `create_goal`/`update_goal`/`create_event` is rejected in full (`UNSUPPORTED_ACTION`) — no partial execution.
- `supabase/tests/ai_proposal_execution_staging.sql` (pgTAP) covers the atomic-claim rollback, the immutability trigger, the double-execution guard (both via the row lock and the partial unique index), cross-community rejection and the service-role-only grants — it could not be run in this build environment for the same reason noted in Sprint 4/5 above (`supabase test db` requires Docker). `supabase/functions/execute-ai-proposal/executor_concurrency_test.ts` fires genuinely concurrent (`Promise.all`) requests through the real orchestration code against a lock-faithful mock of the SQL claim semantics, and was run as part of this deliverable's `deno test`.
