# Production Release Checklist

Every item needs owner, timestamp and evidence link.

## Approval inputs

- [ ] Release commit/tag created; worktree clean
- [ ] Production frontend host and exact HTTPS origin recorded
- [ ] Production Supabase project ref/region/plan recorded
- [ ] Dashboard project created with unique name, approved region and generated password stored in the password manager
- [ ] Project ref copied from Settings → General; API URL and publishable key copied from Settings → API
- [ ] Staging ref is absent from Production frontend and commands
- [ ] Previous frontend artifact and Function revisions recorded
- [ ] Change window, incident commander and rollback deadline recorded

## Data and recovery

- [ ] Latest backup/restore point visible
- [ ] RPO/RTO and PITR decision approved
- [ ] Plan/compute supports the approved retention; PITR enabled if RPO is below 24 hours
- [ ] Off-site logical dump policy confirmed
- [ ] Migrations 001–009 reviewed in order
- [ ] `seed.sql` explicitly excluded
- [ ] Production `reset` community and Owner invitation bootstrap reviewed

## Configuration

- [ ] Auth Site URL is exact Production origin
- [ ] Redirect allowlist contains exact `/auth/callback`; no localhost/staging/wildcards
- [ ] Email Magic Link and custom SMTP deliverability verified
- [ ] `APP_URL` is only the Production origin
- [ ] `APP_ENV=production`; staging remains `APP_ENV=staging`
- [ ] OpenAI, Google and LINE resources are Production-specific
- [ ] Required secret names present; no values captured in evidence
- [ ] Auth email provider, Site URL, exact `/auth/callback`, SMTP sender/domain and delivery test completed
- [ ] Functions deployed only after secrets; status/version/SHA and `verify_jwt` recorded
- [ ] Google/LINE callbacks use the Production project ref

## Verification

- [ ] Full local quality gates green
- [ ] Production migrations list matches 001–009
- [ ] RLS/grants/security-definer checks pass
- [ ] AI Functions ACTIVE with JWT verification
- [ ] Known-origin CORS 204; unknown origin 403/no Allow-Origin
- [ ] Frontend artifact secret inspection passes
- [ ] Minimal Production smoke passes
- [ ] Monitoring dashboards/alerts observed after release

## Go/no-go

Any unchecked backup, environment-isolation, Auth/CORS, secret, migration or rollback item is a NO-GO. Production mutation commands require a separate explicit approval after all placeholders are resolved.
