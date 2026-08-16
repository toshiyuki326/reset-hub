# Release Candidate Staging Deployment

This document is an operator runbook. Codex did not execute any remote command.

## Inputs

- Migrations: `202608120001` through `202608150008`; for an environment already through 006, push 007 and 008.
- Edge Functions: `project-ai-chat` and `execute-ai-proposal`.
- Required secrets: `OPENAI_API_KEY`, `APP_URL`; optional `OPENAI_MODEL`. Supabase-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must remain available. Never store values in Git.

## Operator commands

1. Confirm the target: `npx supabase projects list` and `npx supabase status`.
2. Link staging only: `npx supabase link --project-ref <STAGING_PROJECT_REF>`.
3. Preview migrations: `npx supabase db push --dry-run`.
4. Apply migrations: `npx supabase db push`.
5. Configure secrets if absent: `npx supabase secrets set OPENAI_API_KEY=... APP_URL=... OPENAI_MODEL=...`.
6. Deploy: `npx supabase functions deploy project-ai-chat` then `npx supabase functions deploy execute-ai-proposal`.
7. In a staging-only community, verify message → proposal → approve → explicit execute for all five action kinds and confirm audit rows.
8. Repeat cross-community, inactive-member, rejected and duplicate-execution negative checks.

## Expected result

The chat function generates/persists proposals without operational writes. Review changes only proposal state. Explicit execution creates/updates the intended same-community record once and writes an execution/activity audit.

## Rollback

1. Stop traffic to the two AI functions or redeploy the previous known-good function bundle.
2. Do not reverse an applied migration by editing history. Create a reviewed forward migration that revokes new RPC access and restores the prior function body.
3. If provider behavior is the issue, remove/rotate `OPENAI_API_KEY` to fail closed while preserving stored data.
4. Preserve execution audits; do not delete them during rollback.
