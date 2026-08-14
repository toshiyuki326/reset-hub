# Staging Verification

Date: 2026-08-12 (Asia/Tokyo)

No staging account credentials, Supabase access token/project reference, LINE channel, Google OAuth client, staging URL, or iPhone device session were available in this workspace. External-service rows therefore remain **BLOCKED**, not passed. No production credentials were used.

| Test | Status | Evidence | Notes |
|---|---|---|---|
| Supabase CLI availability | PASS | `npx supabase --version` → 2.113.0 | CLI downloaded successfully |
| Supabase staging project connection | BLOCKED | `npx supabase projects list` → Access token not provided | Requires account-owner login/token |
| Fixture disabled in staging | READY | `.env.staging.example`, `npm run staging:preflight` | Requires public staging URL/anon key to execute |
| Migrations applied | BLOCKED | Two migrations present in `supabase/migrations` | Requires linked project/database password |
| Schema/index/FK verification | BLOCKED | Migration SQL reviewed | Run SQL verification after migration |
| RLS integration/pgTAP | BLOCKED | `supabase/tests/rls.sql` present | Requires staging/local Supabase database |
| RLS policy regression tests | PASS | Vitest authorization matrix | Static regression; not a substitute for DB execution |
| Real Owner Magic Link/bootstrap | BLOCKED | AuthProvider/AuthGate/bootstrap RPC implemented | Requires Owner email and Auth URL configuration |
| Real Task persistence | BLOCKED | Supabase CRUD implemented | Fixture E2E passes; real DB not connected |
| Real Event persistence/timezone | BLOCKED | Supabase CRUD and Asia/Tokyo sync body implemented | Requires staging DB |
| Edge Function deployment | BLOCKED | `line-webhook`, `google-calendar-connect`, `google-calendar-sync` ready | Requires project access |
| LINE invalid signature | PASS (unit) | Valid/invalid HMAC unit tests | Deployed HTTP 401 still requires staging |
| LINE idempotency | READY | `line_message_id` UNIQUE and duplicate handling | Requires deployed replay test |
| Real LINE group → Inbox | BLOCKED | Webhook and relational Inbox query implemented | Requires LINE channel/group |
| LINE → Task/Event | PASS (fixture/RPC review) | E2E plus atomic SQL RPC | Real DB transaction verification blocked |
| Google wrong/expired/replayed state | PASS (regression) | server hash, expiry, consumed row and security tests | Real callback test blocked |
| Google connect/token encryption | BLOCKED | OAuth+PKCE+AES-GCM implemented | Requires OAuth client and secrets |
| Google Calendar create/update/delete/retry | PASS (mock) | Calendar sync core tests | Real Calendar verification blocked |
| Google disconnect/reconnect | BLOCKED | revoke + credential deletion implemented | Requires connected staging account |
| Owner/Member real permission test | BLOCKED | RLS matrix tests present | Requires two staging users |
| Desktop approved Sidebar colors | PASS | CSS uses `#e7db73` and `#137d8c` | Browser E2E build verified |
| Mobile Safari-equivalent E2E | PASS | Playwright WebKit/iPhone 13 profile: 3/3 | Automated viewport/browser coverage |
| Physical iPhone Safari/PWA | BLOCKED | Manifest/service worker generated | Requires physical iPhone and staging HTTPS URL |
| Lint/typecheck/unit/E2E/build/audit | PASS | Completion report command output | See final report |
| Production bundle secret inspection | PASS | `npm run security:inspect-build` | Identifier scan; public Supabase values are allowed |

## Required staging commands

Run only after the account owner creates `reset-hub-staging` and authenticates the CLI:

```bash
npx supabase login
npx supabase link --project-ref <STAGING_PROJECT_REF>
npx supabase db push
npx supabase test db
npx supabase functions deploy line-webhook --no-verify-jwt
npx supabase functions deploy google-calendar-connect --no-verify-jwt
npx supabase functions deploy google-calendar-sync
npx supabase secrets set --env-file .env.edge.staging
npm run staging:preflight -- .env.staging.local
```

`.env.edge.staging` must be ignored/untracked and must never be attached to this report. Generate the Google encryption key locally as 32 random bytes encoded with Base64, then send it directly to `supabase secrets set`; do not print or paste it into documentation.

## Account-owner verification sequence

1. Configure Auth Site URL and redirect allow-list for the staging HTTPS URL.
2. Insert an expiring Owner invitation, then exercise Magic Link → profile → owner membership.
3. Complete real Task and Event CRUD before enabling LINE.
4. Configure LINE webhook, test invalid signature, valid delivery, replay, silent group behavior, and manual conversions.
5. Configure the Google OAuth client with the exact Edge Function callback URI, then test state rejection, connect, Calendar CRUD, retry, revoke and reconnect.
6. Invite a Member and execute the RLS matrix from a separate browser profile.
7. Use a physical iPhone to test Safari and Add to Home Screen.
