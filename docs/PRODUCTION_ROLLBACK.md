# Production Rollback

## Principles

- Never edit or reverse an applied migration file.
- Prefer forward fixes for schema/data-contract defects.
- Preserve executed proposals, execution rows and audit evidence.
- A database restore is an incident operation with downtime and data-loss implications, not a routine application rollback.

## Frontend

Keep the previous immutable artifact and environment binding. If the release fails before compatible writes occur, atomically repoint hosting to the previous artifact. Purge/invalidate the PWA service worker only through the hosting rollback procedure; do not tell users to bypass security boundaries.

## Edge Functions

Before deploy, save the previous version, revision SHA and downloaded source bundle in the release record. Roll back by redeploying that exact reviewed bundle to the same Production ref, one Function at a time, then re-run known/unknown-origin preflight and unauthorized-boundary checks.

## Database

For migration failure before commit, stop and inspect; PostgreSQL transactional migrations normally roll back. For a committed incompatible migration, disable the affected release surface and ship a reviewed forward-only migration. Use backup/PITR restore only for confirmed destructive corruption after incident-command approval.

Supabase currently provides automatic daily backups on Pro/Team/Enterprise, with PITR as an add-on; confirm the selected Production plan and visible restore point before release. Record RPO/RTO and the restore owner.

## Decision matrix

| Failure | First response | Rollback |
|---|---|---|
| Blank frontend | Stop promotion; inspect env/artifact | Previous frontend artifact |
| Function regression | Keep DB; stop affected UI workflow | Previous exact Function revision |
| CORS/Auth config | Correct exact origin/callback | Restore previous dashboard settings |
| Provider outage | Fail closed; retain proposals | No DB rollback |
| Migration mismatch | Stop all deploy steps | Forward fix or complete missing migration |
| Corrupt/destructive data | Freeze writes and preserve evidence | PITR/daily backup only with incident approval |

