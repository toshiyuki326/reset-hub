# Production Architecture

## Environment boundary

Production is a separate stack, not a mode of staging. It requires a distinct HTTPS frontend origin, Supabase project/ref, database, Auth users, anon key, Function secrets, OpenAI key/project, Google OAuth client and LINE channel/webhook. No staging project ref, URL, key, OAuth client, webhook or test community UUID may be copied.

| Layer | Production contract |
|---|---|
| Frontend | Immutable React/Vite PWA artifact on an HTTPS static host with SPA history fallback and atomic promotion/rollback |
| Supabase | Dedicated paid Production project: Auth, Postgres, Storage capability, Edge Functions and logs |
| Auth | Email Magic Link, invitation-gated application bootstrap, exact production callback URL |
| Database | Migrations 001–009 in order; RLS and grants remain enabled |
| Edge Functions | `project-ai-chat`, `execute-ai-proposal`, `google-calendar-connect`, `google-calendar-sync`, `line-webhook` when each integration is enabled |
| AI | Dedicated Production OpenAI API key; `gpt-4.1-mini` unless an approved model change is separately tested |
| Google | Dedicated Production OAuth Web Client and redirect URI tied to the Production Supabase ref |
| LINE | Dedicated Production channel secret/access token and Production webhook URL |

The browser receives only `VITE_SUPABASE_URL`, the publishable/anon key and `VITE_USE_FIXTURES=false`. Service-role, OpenAI, Google and LINE credentials remain server-side.

## Frontend hosting decision

The application is a static Vite SPA/PWA. Recommended default: **Cloudflare Pages**, with a dedicated Production project, custom HTTPS domain, Production-only build variables, Production-branch protection and retained immutable deployments. It fits static delivery and makes prior-deployment rollback straightforward. Vercel and Netlify are acceptable alternatives with equivalent custom-domain, environment-variable, preview and rollback controls; select them if account ownership or organizational support is stronger. Whichever host is chosen must rewrite non-file routes to `/index.html`, preserve generated PWA assets, expose exactly one stable HTTPS origin, and never inject service-role or provider secrets.

Candidate URL patterns are `app.<approved-domain>` or `hub.<approved-domain>`. The final choice is a product decision and must become the exact Auth Site URL, `<origin>/auth/callback`, Edge `APP_URL`, Google return target and CORS origin.

## Recovery recommendation

For launch, choose a paid Supabase plan with daily backups and enable PITR when the approved RPO is below 24 hours. Record explicit RPO/RTO, retention and restore-test owner; availability of a backup is not a substitute for a rehearsed restore.

## Data and execution boundaries

The five canonical actions remain `create_task`, `update_task`, `create_goal`, `update_goal`, and `create_event`. Approval never executes. Explicit confirmation invokes the JWT-protected executor, which re-derives identity, active membership, ownership and community, then calls the service-role-only atomic RPC. Post-execution UI refreshes the affected DB-backed slice.

Production Storage is provisioned with the Supabase project but no bucket is required by the current release. Do not create public buckets speculatively.

## Required release inputs

Before approval, record without secrets:

- `PRODUCTION_FRONTEND_ORIGIN` and hosting provider/project
- `PRODUCTION_PROJECT_REF` and region
- Supabase plan, daily-backup retention and PITR decision
- Owner email and display name
- OpenAI organization/project and budget alert owner
- Google OAuth client owner and LINE channel owner
- rollback artifact identifier and on-call contact
