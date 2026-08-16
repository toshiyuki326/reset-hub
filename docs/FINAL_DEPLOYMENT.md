# reset HUB Final Deployment

## Local verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
deno test --node-modules-dir=none --allow-env --allow-net supabase/functions/
npx supabase db reset
npx supabase test db
npm run test:e2e
npm run build
npm run security:inspect-build
npm audit
git diff --check
```

## Staging changes required after approval

This sprint does not perform remote changes. No DB migration is added. The local Function changes require both bundles because the executor imports the canonical Project AI action contract.

```bash
npx supabase functions deploy project-ai-chat --project-ref gjtkfrpgedtvfcczskix
npx supabase functions deploy execute-ai-proposal --project-ref gjtkfrpgedtvfcczskix
```

Do not run `db push`, remote SQL, `secrets set`, Frontend deploy or unrelated Function deploy as part of this change.

## Verification

1. Confirm both Functions are ACTIVE and `verify_jwt=true`.
2. Verify allowed and unknown-origin preflights.
3. Resume with a new `[RC再検証 YYYY-MM-DD]` `create_goal`; do not reuse or edit the failed staging Goal.
4. Before review, inspect raw payload and require `target_date=YYYY-MM-DD` with no `due_date` key.
5. Confirm review-only behavior, explicit execution, HTTP 200, exact DB `target_date`, UI context and both audit rows.
6. Only after that passes, exercise `update_goal` and `create_event` in order. Stop at the first mismatch.

## Rollback

Redeploy the last known-good Function sources. No database rollback is needed because there is no new migration. Do not mutate approved proposals to simulate rollback.
