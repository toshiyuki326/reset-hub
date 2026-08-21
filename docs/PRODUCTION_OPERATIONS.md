# Production Operations

## Monitoring

| Signal | Monitor / response |
|---|---|
| Auth | Magic Link delivery, callback failures, unusual signup volume |
| PostgREST | 401/403 by relation/code, 5xx and latency |
| Edge | Function/version, OPTIONS/POST status, 4xx/5xx rate and duration |
| Project AI | safe provider code/stage, rate-limit rejects, model and token usage |
| Executor | failed/executing age, duplicate rejection, action kinds and audit completeness |
| Google | `google_sync_status=error`, revoked token status, OAuth callback failures |
| LINE | webhook 401 signature failures, 5xx and message ingestion gaps |
| PWA | asset/manifest/service-worker errors and previous-version clients |

Initial alert thresholds (tune after two weeks of baseline): any AI/Executor 5xx in 5 minutes warns; 3 in 15 minutes or a 5xx ratio above 2% pages the release owner. Three Auth callback failures in 15 minutes, any proposal stuck `executing` for 5 minutes, any duplicate execution success, any audit omission, or any cross-community success is critical. OpenAI provider failures above 10% over 15 minutes warn; rate-limit rejects above 20% over 15 minutes trigger capacity review. Google/LINE 5xx or signature failures above 5 in 15 minutes warn. During the first release, inspect dashboards at +5, +15, +30 and +60 minutes.

Alerts must use safe request/execution IDs and error codes only. Never log or paste keys, JWTs, email, raw prompts/messages/context, provider bodies, refresh tokens or full DB rows.

## Secrets

Application-managed Production names:

- `APP_URL`
- `APP_ENV` (`production`; non-secret but mandatory)
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `LINE_CHANNEL_SECRET` (`LINE_CHANNEL_ACCESS_TOKEN` is operationally reserved but unused by current code)

Platform-managed names include `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and Supabase key/JWKS variables. Do not manually copy platform-managed values from staging.

Rotate one integration at a time: create the replacement in its provider, update the Production secret without printing it, redeploy only dependent Functions if required, smoke test, revoke the old credential, and record owner/time. Rotating `GOOGLE_TOKEN_ENCRYPTION_KEY` requires a designed re-encryption or user reconnection plan; changing it blindly makes stored refresh tokens unreadable.

## OpenAI cost envelope

The local release candidate limits are 5 requests/profile/5 minutes, 25 generations/profile/UTC day, 20 requests/community/5 minutes, 100 generations/community/UTC day, 4,000-character user input, 30,000-character serialized context, 20 history messages, 1,200 output tokens, 20-second attempts and at most two provider attempts. Only network/timeout and 5xx failures receive the single retry. Usage is recorded in `ai_usage_events`. Production retains the previously deployed state until migration 010 and the updated Function receive separate approval.

The approved initial operating target is $5/month with alerts at $2/$4/$5. Increase it only after reviewing real Production usage. This target is not a guaranteed billing stop; confirm the selected provider spend-limit behavior and follow the escalation/circuit-breaker recommendations in `PRODUCTION_AI_COST_POLICY.md`.

At the current official `gpt-4.1-mini` rates ($0.40/M input, $1.60/M output), an illustrative conservative request of 10,000 input + 1,200 output tokens is about $0.00592. At the community limiter's theoretical 14,400 requests/day, that is about $85.25/day or $2,557.44/30 days for one provider attempt per request. A fully billed second attempt could approach twice that amount. This is a protective scenario, not a forecast or hard billing cap: actual cost depends on token counts, provider acceptance/retry behavior and active traffic. Configure OpenAI project budgets/alerts and monitor `ai_usage_events`.

## Cadence

- Daily: Function errors, stuck executions, provider/rate limits, Google/LINE failures.
- Weekly: token/cost trend, Auth delivery, backup success, restore-point visibility.
- Monthly: access review, secret age, dependency audit and restore drill evidence.

## Release artifacts

Name frontend artifacts `reset-hub-web-<short-sha>-<UTC timestamp>-production.tar.gz` and Function bundles `reset-hub-functions-<short-sha>-<UTC timestamp>.tar.gz`. Store outside the repository with SHA-256 checksums and a manifest containing full Git SHA/tag, UTC build time, Node/npm/Deno versions, non-secret environment identity, migration list, Function source hashes and previous deployed versions. Never put secret values in the manifest. Vite source maps are not published. Retain the current and previous two releases so rollback does not require rebuilding mutable source.
