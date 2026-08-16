# reset HUB Final Security Review

## Boundaries

- Anonymous access receives no application-table privileges.
- Authenticated access is limited by table grants and RLS; inactive membership fails `is_active_member` checks.
- `project-ai-chat` and `execute-ai-proposal` verify JWTs.
- OpenAI and service-role credentials exist only in Edge Function secrets.
- `review_ai_proposal` is the only browser review transition.
- `execute_ai_proposal` and `mark_ai_proposal_failed` are service-role-only.
- SECURITY DEFINER functions use pinned `public, pg_temp` search paths.
- Approved proposal payloads are immutable through a DB trigger.

## Executor controls

| Control | Enforcement |
|---|---|
| Approved only | Edge validation and locked DB row |
| Human execution | Separate explicit confirmation UI |
| Allowlist | Five literal action kinds |
| Schema | Strict canonical Zod contract; no passthrough |
| Community | Trusted message/session community; target lookup verifies community |
| Membership | Active membership re-derived in Edge and RPC |
| Atomicity | Claim, all writes, audit and final status share one transaction |
| Duplicate prevention | Row lock, state transition, execution ID and partial unique index |
| Audit | `ai_proposal_executions` plus `activity_logs` |

## Logging policy

Allowed: request/execution IDs, safe error codes, validation stage/path/code, action kind/count, model, token counts and duration. Forbidden: API keys, JWTs, email, raw prompts/messages/context/provider responses and full DB rows.

## Residual risks

- Provider availability remains an external dependency.
- A browser disconnect can hide a completed response, but DB state remains authoritative and reload-safe.
- Existing already-approved payloads are immutable; invalid historical proposals must not be rewritten.
- Google and LINE external side effects remain outside the AI executor.

No critical or high-severity finding remains in the reviewed scope.
