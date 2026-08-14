# Production Hardening Review

| Finding | Resolution |
|---|---|
| Fixture-only persistence | Resolved: Supabase data service added; fixture requires explicit flag |
| Auth was visual only | Resolved: Magic Link, session recovery, AuthGate, logout |
| No first-login bootstrap | Resolved: expiring invitation bootstrap RPC |
| Incomplete RLS | Resolved: event_members, line_users, profiles, groups, invitations and role policies added |
| LINE UI disconnected | Resolved: relational Inbox query and atomic conversion RPC |
| LINE source could be lost | Resolved: Task and Event source columns set transactionally |
| OAuth state depended on redirect header | Resolved: hashed server state, expiry, atomic consume and PKCE |
| Google sync stub | Resolved: token refresh and events insert/patch/delete/retry |
| Token revocation not handled | Resolved: token_status=revoked and local Event status=error |
| No production security regression tests | Resolved: security invariant, sync core, E2E and RLS tests added |

## Staging Integration follow-up

- Resolved: staging env template/preflight and Supabase CLI configuration added.
- Resolved: desktop Sidebar colors fixed to approved `#e7db73` / `#137d8c` palette.
- Resolved: build artifact Secret identifier scanner added.
- Resolved: real HMAC valid/invalid unit tests and WebKit mobile E2E added.
- Pending external access: real Supabase, LINE, Google, Member account and physical iPhone verification. See `STAGING_VERIFICATION.md`.
- Resolved: renamed the conflicting RLS role helper to `current_user_community_role` in both original migrations and every policy/RPC/test reference.
