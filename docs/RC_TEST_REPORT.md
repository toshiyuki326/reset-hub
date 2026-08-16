# Release Candidate Local Test Report

Reference environment: Mac mini, Docker local Supabase, Supabase CLI 2.114.0.

## Database

- Local reset applies migrations 001–008 and seed data.
- pgTAP retains the original 57 assertions and adds 20 RC executor/rate-limit assertions.
- Coverage includes RLS, Project AI persistence/review, task/goal/event execution, atomic rollback, immutable proposals, audit, role/community boundaries, forged IDs, rate limiting and duplicate execution.

## Application and Edge Functions

- Vitest covers browser wiring, structural security, context/prompt boundaries and route lazy loading.
- Deno covers provider classification, structured schema validation, five-action validation, executor error mapping and concurrent execution simulation.
- Required release commands: `npm ci`, lint, typecheck, Vitest, Deno tests, production build, build secret inspection and npm audit.

## Final clean run

- pgTAP: 77/77 across 4 files (original 57 retained, RC expansion 20).
- Vitest: 87/87 across 15 files.
- Deno: 32/32.
- Playwright: 10/10 across desktop Chromium and iPhone 13/WebKit projects.
- ESLint, TypeScript, production build and build-secret inspection: PASS.
- `npm audit`: 0 vulnerabilities.

## Bundle result

- Before: one 636.74 kB initial JS chunk (185.01 kB gzip).
- After route lazy loading only: 526.48 kB largest initial chunk.
- Final after stable vendor isolation: largest chunk 230.21 kB (73.77 kB gzip); no 500 kB warning.
