# reset HUB Operations

## Daily checks

- Edge Function failure rate and latency by safe request ID.
- `ai_usage_events` model, token usage, duration and safe error code.
- `ai_proposal_executions` status, action kinds, execution ID and completion time.
- Proposals remaining `executing`; investigate rather than editing payloads.
- Profile/community rate-limit events.

## Common errors

| Symptom | Check |
|---|---|
| Blank page | Required Vite environment variables and production build console |
| localhost works, 127.0.0.1 fails | Auth redirect and CORS origin allowlist |
| Magic Link session mismatch | Link origin, callback origin and existing browser storage |
| Embedded query 403 | Grants on `event_members`, `line_groups`, `line_users` plus RLS |
| OPTIONS 200 but POST blocked | Requested headers versus `Access-Control-Allow-Headers`; successful preflight is 204 |
| INVALID_STRUCTURED_RESPONSE | Safe provider diagnostic stage/path and Function revision |
| INVALID_ACTION | Action index/kind, Zod path and canonical enum values |
| Goal executes but target date is NULL | Inspect the saved action: Goal dates belong in `target_date`; any `due_date` key is cross-action leakage and must be rejected before execution |
| Docker port conflict | Existing Supabase project/container and configured 54321/54322 ports |
| pgTAP helper error | Use catalog `relrowsecurity`; do not assume unavailable helpers |
| Migration mismatch | Compare local/remote migration lists before any deploy |

## Safe retry

- Project AI retry sets `retry=true`, preventing duplicate user-message insertion.
- Provider retry is bounded to two attempts and a 20-second request timeout.
- Executor retry is safe only by message ID; DB state and locking prevent a second mutation.
- Reload the conversation after a lost response before retrying execution.
- Never repair an executed proposal payload or its audit row; generate and review a new corrected proposal.

## Cost controls

Profile: 10 requests/5 minutes. Community: 50 requests/5 minutes. Input message is 4,000 characters, HTTP body 16 KB, context serialization 30,000 characters, history 20 DB messages, output 1,200 tokens and provider retries two attempts maximum.
