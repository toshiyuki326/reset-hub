# Production Smoke Test

## Data policy

Use a dedicated Production smoke-test community and invited Owner, clearly named `[PROD SMOKE YYYY-MM-DD]`. Never use customer/community data. Delete disposable Task/Event rows only under an approved cleanup procedure; never delete audit rows.

## Minimal launch smoke

1. Open the formal HTTPS origin; verify PWA shell and no env/blank-page error.
2. Send a Magic Link to the invited smoke Owner and confirm `/auth/callback` returns to the same origin.
3. Verify Dashboard, Task read, Event read, LINE empty/read state and no cross-community data.
4. Create one clearly marked Task through the normal Task UI and verify DB/UI.
5. Send one Project AI normal-answer prompt; require HTTP 200 and no proposal/mutation.
6. Generate one proposal and confirm no mutation before review and none after approval alone.

## Executor decision

Do not execute a mutation in the default Production smoke. The atomic executor has already passed local pgTAP and real staging Human validation. If release governance requires a Production executor test, use only the dedicated smoke community, execute one reversible `create_task`, verify exact DB/UI/audit and archive the task rather than deleting audit evidence.

## Stop conditions

Stop immediately on any CORS failure, Auth redirect mismatch, unexpected 4xx/5xx, cross-community visibility, inactive-member access, semantic mismatch, missing audit, duplicate mutation, Google/LINE side effect or secret-bearing log. Do not continue to later steps or patch Production ad hoc.

