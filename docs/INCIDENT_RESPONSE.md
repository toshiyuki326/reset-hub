# reset HUB Incident Response

## Triage

1. Record timestamp, Function name/version, safe request ID and HTTP status.
2. Determine stage: CORS, JWT, membership/session, rate limit, provider, schema, review, action validation or RPC.
3. Correlate only safe identifiers with `ai_usage_events`, `ai_proposal_executions` and `activity_logs`.
4. Never paste secrets, JWTs, raw prompts, user messages, context or provider responses into tickets.

## Containment

- Provider/schema incident: stop Function deployment and retain proposal review boundary.
- Executor incident: do not grant browser RPC access or perform direct table writes.
- Suspected secret exposure: rotate through the approved secret-management process; do not print current values.
- Cross-community concern: disable the affected workflow at the Function layer and preserve DB evidence.
- Semantic field mismatch: stop the remaining action matrix, preserve the executed proposal/audit, and compare raw action fields with the canonical action-specific contract.

## Recovery

- Verify DB proposal status and audit before retrying.
- An `approved` row after an RPC error indicates transaction rollback; investigate safe error code.
- An `executed` row is complete even if the browser lost the response; do not execute again.
- A `failed` row is terminal; create and review a corrected proposal instead of mutating it.
- If a row is unexpectedly `executing`, collect execution ID/timestamps and escalate; do not manually change it without an approved incident plan.

## Post-incident validation

Run all local gates, pgTAP and both mobile engines. Reproduce with synthetic data and add a regression test before proposing a deploy.

For the 2026-08-16 Goal incident, the unsafe shape was `create_goal` with a
Task-only `due_date` and `target_date=null`. Recovery requires a new proposal;
the original executed Goal and audit must remain unchanged.

## Production symptom runbook

| Symptom | Safe diagnosis | Containment / recovery |
|---|---|---|
| Blank page/env error | Artifact ID, public Vite variable presence, asset status | Roll back to previous immutable frontend artifact |
| Auth callback failure | Exact Site URL, `/auth/callback`, email delivery and browser origin | Restore exact Production redirect; never add broad wildcard as a shortcut |
| DB permission 403 | PostgREST code, table/embedded relation, grants and RLS role | Stop; compare migrations/grants. Never disable RLS or grant anon |
| Edge CORS | Origin, requested headers/method, preflight response | Restore exact `APP_URL`; unknown origins must remain rejected |
| OpenAI outage | Safe provider code/status and duration | Fail closed; preserve conversations/proposals; retry only within bounded policy |
| Invalid structured response | stage, status, issue path/code, model/revision | Stop proposal generation; use synthetic fixture before any schema change |
| Invalid action | action index/kind, validation stage/path/code | Stop execution; compare canonical provider/executor/DB contracts |
| Executor failure | proposal state, safe SQLSTATE mapping, execution ID/audit | Do not direct-write or replay an executed proposal; generate a new proposal when required |
| Stale Store | DB row and executed state versus affected frontend slice | Refresh DB-backed slice; execution success remains authoritative |
| Migration mismatch | local/remote ordered list and release commit | Stop all later deploy steps; apply reviewed missing migration or forward fix |
| Google token expiry | token status and safe Google HTTP class | Mark disconnected/revoked and require Owner reconnection; never expose token |
| LINE signature failure | HTTP 401 rate and channel configuration | Verify Production channel secret/webhook; never bypass HMAC validation |

## Escalation evidence

Capture timestamp/timezone, environment/project name, release commit, frontend artifact, Function version/SHA, safe request/execution ID, HTTP status, safe error code/stage, affected community ID only when policy permits, and the rollback decision. Preserve audit rows. Do not attach secret hashes or raw dashboard exports containing sensitive values.
