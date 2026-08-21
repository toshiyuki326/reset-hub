# Production Deployment

> Current-state guard (2026-08-21): Production already exists at `https://reset-hub.pages.dev` with project `reset-hub-production`, migrations 001–009, community `reset`, Owner bootstrap and frontend deployment complete. Migration 010 and the AI Function cost guards are local-only and not deployed. Creation, seed and bootstrap instructions below are historical reference and must not be rerun. Remaining work is Custom SMTP and separately approved application of migration 010 plus deployment of the AI Functions after required secrets exist. Unresolved `<...>` placeholders are blocking markers, never executable values.

## Remaining Resend SMTP configuration

This is a human Dashboard operation because it creates credentials and changes Auth delivery. Verify an owned sending domain in Resend first, then configure Supabase Authentication → Emails → SMTP Settings with host `smtp.resend.com`, port `465` (implicit TLS; `587` is the STARTTLS alternative), username `resend`, password set to a dedicated Resend API key, sender email on the verified domain, and sender name `reset HUB`. Never paste the API key into chat, Git or release evidence. Preserve email confirmation/Magic Link behavior, send one controlled Owner Magic Link, and verify callback to `https://reset-hub.pages.dev/auth/callback` before raising email rate limits.

## Preconditions

Use a reviewed release commit/tag, a clean worktree and a recorded immutable frontend artifact. Replace every `<...>` placeholder deliberately. Never use the staging ref `gjtkfrpgedtvfcczskix` in Production commands or frontend environment.

## Release order

1. Freeze writes/change window; record owners and rollback decision time.
2. Verify Supabase backup status and take an off-site logical dump where supported.
3. Create/confirm the dedicated Production Supabase project and plan.
4. Link only after visually verifying the Production project name/ref twice.
5. Verify existing migrations 001–009, then apply only the separately approved forward migration 010. Do **not** run `supabase/seed.sql` in Production.
6. Verify schema, RLS, table grants, SECURITY DEFINER grants and migration list.
7. Create `reset` community and one unused Owner invitation through a reviewed one-time bootstrap procedure; do not create fixture/RC rows.
8. Configure Production Auth URL/email/SMTP settings.
9. Set Production-only Function secrets, then deploy the required Functions.
10. Verify Function versions, JWT settings and CORS preflight before exposing the frontend.
11. Build frontend from the release commit with Production public environment and publish the immutable artifact.
12. Perform the minimal smoke plan, monitor, then close the change window.

## Command sheet

Read-only/preflight:

```bash
git status --short
git diff --check
git rev-parse HEAD
npx supabase migration list --project-ref <PRODUCTION_PROJECT_REF>
npx supabase functions list --project-ref <PRODUCTION_PROJECT_REF>
npx supabase secrets list --project-ref <PRODUCTION_PROJECT_REF>
```

Remote mutation commands below require a separate explicit Production approval:

```bash
npx supabase link --project-ref <PRODUCTION_PROJECT_REF>
npx supabase db push --linked
npx supabase secrets set --project-ref <PRODUCTION_PROJECT_REF> \
  APP_URL=<PRODUCTION_FRONTEND_ORIGIN> \
  APP_ENV=production \
  OPENAI_API_KEY=<FROM_SECRET_MANAGER> \
  OPENAI_MODEL=gpt-4.1-mini
npx supabase functions deploy project-ai-chat --project-ref <PRODUCTION_PROJECT_REF>
npx supabase functions deploy execute-ai-proposal --project-ref <PRODUCTION_PROJECT_REF>
```

Deploy Google/LINE Functions only after their dedicated Production credentials and callbacks are configured:

```bash
npx supabase functions deploy google-calendar-connect --project-ref <PRODUCTION_PROJECT_REF>
npx supabase functions deploy google-calendar-sync --project-ref <PRODUCTION_PROJECT_REF>
npx supabase functions deploy line-webhook --project-ref <PRODUCTION_PROJECT_REF>
```

Build-time public values belong in the hosting provider, never Git:

```text
VITE_SUPABASE_URL=https://<PRODUCTION_PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<PRODUCTION_PUBLISHABLE_KEY>
VITE_USE_FIXTURES=false
VITE_APP_ENV=production
```

## Environment contract

| Scope | Name | Required | Secret | Contract |
|---|---|---:|---:|---|
| Frontend | `VITE_SUPABASE_URL` | yes | no | Dedicated Production project URL |
| Frontend | `VITE_SUPABASE_ANON_KEY` | yes | public | Production publishable/anon key only |
| Frontend | `VITE_USE_FIXTURES` | yes | no | Exactly `false` |
| Frontend | `VITE_APP_ENV` | recommended | no | Exactly `production`; release evidence only |
| Edge | `APP_URL` | yes | no | One exact HTTPS origin, no path/trailing slash/list |
| Edge | `APP_ENV` | yes | no | `production`; missing/unknown fails CORS closed |
| AI | `OPENAI_API_KEY` | yes | yes | Production OpenAI project key |
| AI | `OPENAI_MODEL` | optional | no | Defaults to `gpt-4.1-mini` |
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | if enabled | mixed | Dedicated Production OAuth client |
| Google | `GOOGLE_TOKEN_ENCRYPTION_KEY` | if enabled | yes | Stable Production-only encryption key |
| LINE | `LINE_CHANNEL_SECRET` | if enabled | yes | Dedicated Production channel secret |

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; never expose or copy the service-role value to the frontend. Staging must explicitly use `APP_ENV=staging`; local development uses `APP_ENV=development`.

Before step 9, configure the dedicated OpenAI project with an initial $5/month operating target and alerts at $2/$4/$5. Treat that amount as an operational target, not a guaranteed billing stop; verify the provider's selected spend-limit behavior, assign an alert owner, and follow `PRODUCTION_AI_COST_POLICY.md`. Do not create the key or enable the AI Functions until that audit has been accepted.

## Owner bootstrap (reviewed one-time SQL)

Run only after migrations, in a transaction, replacing both placeholders. It creates no Auth user and no fixture data; the matching Magic Link user consumes the invitation through `bootstrap_current_user`.

```sql
begin;
with created_community as (
  insert into public.communities (name, slug)
  values ('reset HUB', '<PRODUCTION_UNIQUE_SLUG>')
  returning id
)
insert into public.community_invitations (community_id, email, role, expires_at)
select id, lower('<OWNER_EMAIL>'), 'owner'::public.member_role, now() + interval '24 hours'
from created_community;
commit;
```

Before execution confirm the slug/email, zero matching rows, and named operator; retain the invitation/community IDs as evidence. Do not log the email in general release logs.

## Manual dashboard operations

- Auth → URL Configuration: Site URL `<PRODUCTION_FRONTEND_ORIGIN>`; Redirect URL exactly `<PRODUCTION_FRONTEND_ORIGIN>/auth/callback`.
- Auth → Providers: Email enabled; decide whether new Auth users may be created. Application access still requires an unused invitation.
- Auth → SMTP: configure a Production sender/domain and verify deliverability before launch.
- Database → Backups: verify latest restore point and retention; enable PITR if required by RPO.
- Edge Functions: confirm expected function names, ACTIVE state and JWT verification for both AI Functions.
- Google Console: exact redirect `https://<PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/google-calendar-connect`.
- LINE Developers: webhook `https://<PRODUCTION_PROJECT_REF>.supabase.co/functions/v1/line-webhook`; verify signature flow.

Production Auth/CORS should contain only the formal HTTPS origin. Do not add localhost, `127.0.0.1`, staging or wildcard origins.
