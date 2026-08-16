# Production Configuration Decision Sheet

Decision date: 2026-08-16. Prices and quotas must be rechecked at purchase time. No resource creation is authorized by this document.

## Recommended baseline

| Decision | Recommended default | Alternative / trade-off | Changeability and deploy impact |
|---|---|---|---|
| Frontend hosting | Cloudflare Pages | Vercel has excellent deployment UX; Netlify is a mature static-host alternative. Both may be preferable where account ownership/support already exists. | Migratable, but changes DNS, Auth callback, CORS and release tooling. |
| Origin | `https://hub.<owned-domain>` | `app.<owned-domain>` is more generic. `hub` matches the product vocabulary. | Technically changeable but disruptive: DNS, PWA identity, Auth, CORS, OAuth and bookmarks all change. Decide before launch. |
| Supabase region | Tokyo `ap-northeast-1` for Japan-centric users | Singapore/Seoul only when user/data-residency evidence supports it. | Region is effectively immutable; changing it requires a new project and migration. |
| Supabase plan | Pro | Free only for disposable evaluation; Team only for organizational controls/compliance needs. | Upgradeable, but do not launch relying on later rescue from Free limitations. |
| PITR | Off initially under Recommended tier; enable when RPO <24h or operational value justifies about $100/month for 7 days | On from day one for critical operations. | Enable/disable later; cost and restore procedure change. |
| Backup retention | Pro daily backups, 7 days; monthly restore drill | Team provides 14-day daily retention; PITR offers 7/14/28-day granular windows. | Plan/add-on changeable. Restore evidence must precede reliance. |
| SMTP | Custom SMTP before inviting Production users | Supabase built-in mail only for pre-launch smoke. | Changeable without DB migration; DNS verification and deliverability testing required. |
| Production Owner | Named accountable person using an organization-controlled mailbox with MFA | Shared mailbox only if access/audit ownership is explicit. | Owner membership can be transferred later through reviewed access procedure. |
| OpenAI | Dedicated project/key; `gpt-4.1-mini`; $25 monthly soft budget; alerts at $10/$20/$25 | Start at $10 for very small private pilot; increase only from measured usage. | Budget/model/key are changeable; model changes require regression validation. |
| Google Calendar | Disabled for v1 launch; enable as phase 2 | Enable at launch only with named owner, Production OAuth client, consent/callback and token incident runbook. | Later enablement is isolated but requires Function secrets/deploy and smoke tests. |
| LINE | Disabled for v1 launch; enable as phase 3 | Enable after Google or independently when a named operator/channel exists. | Later enablement requires Production channel, webhook secret/deploy and replay/signature tests. |
| Release window | Weekday 10:00–12:00 JST, avoiding holidays, with 2 hours observation | Another staffed low-usage window. | Per-release choice; availability of owners matters more than clock time. |
| Incident ownership | Release Owner is Incident Commander for launch; separately name Backup and Budget owners | One person may hold several roles, but must name a backup contact. | Changeable; must be recorded before approval. |

## Hosting matrix

All three support HTTPS, custom domains, environment variables, preview deployments and static Vite output. PWA compatibility is primarily correct asset caching and SPA routing configuration.

| Criterion | Cloudflare Pages | Vercel | Netlify |
|---|---|---|---|
| reset HUB fit | Best default for a static SPA/PWA | Excellent, particularly where Vercel is already operated | Good established static-site workflow |
| SPA fallback | `_redirects` rule to `/index.html` | rewrite configuration | `_redirects` rule |
| Immutable deploy/rollback | Previous production deployment rollback | Unique deployment URLs and rollback; Hobby rollback depth is more limited | Atomic deploys and prior deploy restore |
| Predictable cost | Strong for a static site; Free limits include 500 builds/month | Usage-based metrics need monitoring | Plan/usage limits need monitoring |
| Operational caveat | DNS/domain is simplest when Cloudflare manages the zone; redirect `pages.dev` to canonical origin | Avoid unplanned usage charges; deeper rollback may require paid tier | Verify current bandwidth/build quotas at purchase |

Recommendation: **Cloudflare Pages**, provided the organization accepts Cloudflare account/DNS ownership. Configure one canonical custom domain, redirect the `pages.dev` hostname, and retain release artifacts independently of the host.

## Supabase and recovery tiers

Free can pause after seven days of low activity, has 500 MB DB/shared compute, cannot download platform backups, and built-in Auth email is limited to two emails/hour. This is unsuitable for community operations data and immutable AI execution/audit history. Pro currently starts at $25/month, includes 8 GB disk, email support, seven-day daily backups and seven-day logs.

| Tier | Backup / PITR | Target RPO | Target RTO | Cost / burden |
|---|---|---|---|---|
| A — Lean | Pro daily backup, no PITR; periodic logical export | <24h | Same business day, target 8h | Lowest responsible Production cost; potentially a day of data loss and manual recovery. |
| B — Recommended | Pro daily backup 7 days, no PITR initially; monthly restore drill; enable PITR on trigger | <24h | 4h target | Balanced launch baseline. Define a trigger such as sustained daily use or RPO review. |
| C — High Reliability | Pro/Team plus PITR 7–28 days; quarterly restore exercise | Minutes/seconds within retention | 1–2h target | PITR is roughly $100/$200/$400 monthly for 7/14/28 days plus plan/compute; greater runbook burden. |

Selected defaults: Tokyo, Pro, tier B. Confirm legal/data-residency requirements before creating the project.

## Auth and SMTP

The built-in Supabase sender is not an acceptable normal Production dependency: its send quota is low and sender reputation/domain control are not owned by the operator. Use custom SMTP with a verified sender domain, SPF/DKIM (and preferably DMARC), TLS, bounce/complaint handling, monitored credentials and a tested Magic Link to the exact Production callback. Common choices include Amazon SES, Postmark, SendGrid and Resend; choose based on organizational ownership, Japan delivery evidence, support and pricing rather than code changes.

## OpenAI operating envelope

Use a Production-only OpenAI project and restricted server-side key. Keep `gpt-4.1-mini` for v1 because the current structured-output contract and staging validation target it. Current application guards are 10 requests/profile/5 minutes, 50/community/5 minutes, 4,000 input characters, 30,000 serialized-context characters, 20 history messages, 1,200 output tokens, 20-second attempts and at most two attempts.

Start with a $25 monthly budget and $10/$20/$25 notifications. Review daily for launch week and weekly thereafter using OpenAI Costs plus `ai_usage_events`. A project budget should be treated as an alert/control setting, not assumed to be a guaranteed hard stop. Rotate the key every 90 days or immediately on suspected disclosure; update only the Edge secret, smoke test, then revoke the old key. On spend anomaly or provider incident, disable AI entry points/fail closed while preserving conversations and proposals.

At current published rates, `gpt-4.1-mini` is $0.40/M input tokens and $1.60/M output tokens. Reprice before approval.

## Integration release scope

Recommended v1 scope is core workspace + Project AI/Executor only. Google Calendar introduces external writes, OAuth consent, refresh-token encryption/revocation and reconciliation. LINE introduces an internet webhook, signature operations, channel/group ownership and replay handling. Enable Google in phase 2 and LINE in phase 3 with separate approval, credentials, deployment, rollback and Human tests. This reduces simultaneous external side effects without weakening either integration's code boundary.

## Release ownership

| Role | Accountability |
|---|---|
| Release Owner | Go/no-go, exact artifact/configuration, change window and evidence |
| Incident Commander | Coordinates stop/rollback and communications; does not improvise schema fixes |
| Backup/Restore Owner | Restore-point verification, dump custody and restore drill |
| OpenAI Budget Owner | Spend alerts, usage anomaly and key rotation |
| Google Integration Owner | OAuth client, consent, token and Calendar side effects |
| LINE Integration Owner | Channel/webhook, signature failures and group operations |

One person may hold multiple roles, but every enabled scope needs a named primary and backup contact.

## Release commit and tag plan

The repository has one commit, no existing tags, and package version `1.0.0`; there is no conflicting tag convention. Do not commit the current mixed worktree as one release commit.

1. `fix(db): restore authenticated embedded read grants`
2. `fix(ai): unify proposal action contracts and executor validation`
3. `fix(functions): isolate browser CORS by environment`
4. `fix(ui): refresh workspace state after proposal execution`
5. `test(release): preserve RC security and browser regressions`
6. `docs(release): finalize production runbooks and decision record`

Recommended annotated tag after clean rebuild and staging revalidation: `v1.0.0-rc.1`. Promote the exact SHA to `v1.0.0` only after Production approval/smoke acceptance. No commit, tag or push was performed.

## User decision form

Copy, replace bracketed values where necessary, and return:

```text
1. Hosting: Cloudflare Pages (recommended)
2. Production URL: https://hub.<owned-domain> (recommended)
3. Supabase region: Tokyo / ap-northeast-1 (recommended for Japan-centric use)
4. Supabase plan: Pro (recommended)
5. PITR: Off initially; enable when RPO <24h is approved (recommended)
6. Backup/RPO: Tier B — daily backup 7 days, RPO <24h, RTO target 4h (recommended)
7. Owner email: [organization-controlled email]
8. SMTP: Custom SMTP before invitations; provider [name] (recommended)
9. OpenAI budget: $25/month; alerts $10/$20/$25 (recommended)
10. Google Calendar: Disabled at v1; phase 2 (recommended)
11. LINE: Disabled at v1; phase 3 (recommended)
12. Release window: Weekday 10:00–12:00 JST + 2h observation (recommended)
13. Incident owner: [name]; backup contact [name]
14. Commit/tag approval: Approve six commits and annotated v1.0.0-rc.1 [yes/no]
```

Unresolved bracketed items block Production deployment approval. They do not authorize resource creation or remote changes.
