# Handoff note — Sprint 7 (Approved Proposal Executor Foundation)

This folder was AirDropped from a MacBook Pro (where it was developed with Claude Code)
to continue on a Mac mini with Codex. Git history was initialized locally on the source
machine specifically so this handoff is traceable — there is no shared remote yet.

## Where things stand

Sprint 7 is **complete and fully validated** on the source machine. See:

- [`docs/FINAL_REPORT_SPRINT7.md`](docs/FINAL_REPORT_SPRINT7.md) — the full report (all 27 items from the sprint doc: inventory, threat model, migration content, executor architecture, test results, etc.)
- [`docs/THREAT_MODEL_SPRINT7.md`](docs/THREAT_MODEL_SPRINT7.md) — attack-vector-by-attack-vector mitigation table, written before implementation
- `git log` — a single commit capturing the full delivered state (this repo was only just initialized for this handoff; there's no incremental history from development, since none was kept at the time). Going forward, please commit in normal small increments so the history stays useful across both machines.

## Getting productive on this machine

```bash
npm install
npm run lint && npm run typecheck && npm test && npm run build && npm run security:inspect-build
deno test --node-modules-dir=none --allow-env --allow-net supabase/functions/
```

All of the above passed on the source machine right before handoff (83 vitest tests, 31 Deno
tests, clean lint/typecheck/build/secret-scan). If any of these fail here first, suspect an
environment difference (Node/Deno version, `deno.lock` drift) before assuming the code regressed.

`node_modules`, `*.tsbuildinfo`, `dist`, and `supabase/.temp` are gitignored and were not carried
over — `npm install` regenerates `node_modules` from the committed `package-lock.json`.

No `.env*` files (real ones) were ever in this folder — only `.env.example`/`.env.staging.example`.
If you need to run against a real Supabase project on this machine, you'll need to create your own
`.env.local` here; it's gitignored so it won't accidentally get committed or AirDropped back.

## Hard constraint carried over from the sprint doc — please keep respecting it

**No `supabase db push`, no `supabase functions deploy`, no `supabase secrets set`, no remote SQL
mutation.** This deliverable is local-only by design (see the sprint doc / final report §20, §24).
If this Mac mini *does* have Docker (the MacBook Pro didn't), that unlocks one thing that couldn't
be verified there — see below — but it still shouldn't be used to push to any remote project
without the user explicitly asking for that separately.

## The one thing that couldn't be verified on the source machine

`supabase/tests/ai_proposal_execution_staging.sql` (pgTAP, 22 assertions covering the atomic
claim/rollback, the immutability trigger, double-execution prevention via both the row lock and
the partial unique index, cross-community rejection, and the service-role-only grants) was
**written but never executed** — the MacBook Pro had no Docker, and `supabase test db` needs it.

If this machine has Docker:

```bash
supabase start   # or: supabase db reset
supabase test db
```

This is the single highest-value thing to do next if Docker is available here — it's real-Postgres
verification of the two safety requirements the sprint doc called out explicitly (★A: claim+write
atomicity, ★B: DB-enforced proposal immutability), which so far have only been verified by code
review, structural vitest checks, and a lock-faithful mock in
`supabase/functions/execute-ai-proposal/executor_concurrency_test.ts` (real concurrent `Promise.all`
calls, but against a simulation of Postgres's row-lock behavior, not Postgres itself).

## Remaining items (from the final report §26)

- Run the pgTAP file above (needs Docker).
- A true end-to-end concurrency test hitting the deployed Edge Function + real Postgres with actual
  parallel HTTP requests (needs a running local Supabase stack, not just Docker for pgTAP).
- Staging deploy + one real "propose → approve → execute" pass for both `create_task` and
  `update_task`, once the user is ready to deploy (still requires their explicit go-ahead — deploy
  is currently prohibited by the sprint doc, not just untested).

## If work also continues on the MacBook Pro in parallel

There is no shared remote right now, so the two copies will diverge with no automatic way to merge.
If you want to reconcile later: on the machine that ends up "ahead" or with the changes worth
keeping, either (a) push this repo to a GitHub remote and have the other machine add it as a remote
and rebase/merge, or (b) `git bundle create sprint7.bundle --all` on one machine, AirDrop the
bundle file back, and `git pull sprint7.bundle main` on the other. Ask the user which they'd
prefer before picking one — it wasn't specified for this handoff.
