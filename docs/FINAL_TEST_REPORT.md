# reset HUB Final Test Report

## Frozen scenarios

- Normal message returns `type=message`, no proposal and no mutation.
- Human-tested create_task uses `target=task`, canonical status and ISO deadline.
- Review changes proposal to approved but creates no task.
- Explicit execution creates exactly one task, sets executed and records execution/activity audits.
- Negative fixtures cover localized status, unknown kind/key, malformed dates, invalid UUID/target, unapproved/rejected, duplicate, cross-community and inactive users.

## Suites

Final counts are recorded after the release gate run:

| Gate | Result |
|---|---|
| `npm ci` | PASS (618 packages installed; 619 audited) |
| ESLint | PASS |
| TypeScript | PASS |
| Vitest | PASS — 20 files, 106 tests |
| Deno check | PASS — all five Edge Function entry points |
| Deno | PASS — 61 tests |
| local database reset | PASS — migrations 001–009 and seed |
| pgTAP | PASS — 6 files, 120 assertions |
| Desktop Chromium | PASS — 9 tests |
| Mobile Chromium | PASS — 9 tests |
| Mobile WebKit | PASS — 9 tests |
| Production/PWA build | PASS — 2,718 modules; 27 precache entries; largest chunk 230.21 kB |
| Secret inspection | PASS — 28 built files inspected |
| npm audit | PASS — 0 vulnerabilities |
| `git diff --check` | PASS |

The Deno total comprises CORS (3), executor concurrency (1), executor (17),
task executor (10), provider (12), and structured schema (18). pgTAP includes
an exact `project_goals.target_date` semantic assertion, not only an HTTP/RPC
success assertion. Playwright ran the same eight scenarios against all three required
browser profiles for 27 passing tests in total. The added flow verifies that an
Event held in the live Store remains visible across SPA navigation without reload;
the exact AI execute-to-refresh path is additionally covered by controller tests
and a real staging Human validation.

The observed staging failure (`create_goal` placed the requested target date in
`due_date` while leaving `target_date=null`) is now a mandatory rejection
fixture at both provider/schema and Executor validation boundaries.

No assertion is skipped or deleted to obtain a passing result.

The `RC_*` reports are retained as historical evidence. Production procedures are
now authoritative in the `PRODUCTION_*` documents and `INCIDENT_RESPONSE.md`.
