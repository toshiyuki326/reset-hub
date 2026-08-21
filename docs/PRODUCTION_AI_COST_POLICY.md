# Production AI Cost Policy

## Approved initial policy

- Initial monthly operating target: **$5**
- Alerts: **$2 / $4 / $5**
- Review actual Production usage before any increase.
- Do not represent $5 as a guaranteed billing stop. Confirm the selected OpenAI project spend-limit mode and keep an operational response owner.
- Production OpenAI project/key creation remains blocked pending approval after this audit.

## Audited application controls

| Control | Current implementation | Assessment |
|---|---|---|
| User input | 4,000 characters; HTTP `Content-Length` above 16,000 bytes rejected | Bounded. The byte check is advisory when the header is absent, but parsed message length remains enforced. |
| Context | Serialized context truncated at 30,000 characters; DB queries cap tasks 100, goals/KPIs/events/activity 50 each and history 20 | Bounded by characters/rows, not tokenizer-exact input tokens. |
| Output | `max_output_tokens: 1200`; strict Structured Output; at most 10 proposal actions | Bounded and schema-validated. |
| Model | Defaults to `gpt-4.1-mini`; local release candidate accepts only that exact model | Code allowlist added; Production remains unchanged until separately approved deployment. |
| Per profile | Atomic Postgres claim: 5 requests per five-minute window and 25 accepted generation claims per UTC day | Implemented locally in migration 010. All accepted attempts, including explicit UI retries, consume a claim. |
| Per community | Atomic Postgres claim: 20 requests per five-minute window and 100 accepted generation claims per UTC day | Implemented locally in migration 010. |
| Burst/concurrency | Atomic upsert counters prevent race bypass; frontend single-flight prevents duplicate clicks in one client | No one-request-at-a-time server lock and no rolling one-second burst limit. |
| Proposal generation | One assistant response/proposal is persisted per successful chat invocation; response allows 1–10 actions | No daily/monthly proposal-generation quota. A user may explicitly issue another request within rate limits. |
| Executor | `execute-ai-proposal` validates and calls the database RPC; it contains no OpenAI/provider call | Execution and retries do not incur AI-token cost. Keep executor available if generation is operationally disabled. |
| Timeout | 20 seconds per provider attempt | Bounded per attempt; two attempts can make provider wait approximately 40 seconds plus backoff/overhead. |
| Retry | Maximum two provider attempts; only network/timeout and 5xx receive one retry after 200 ms; 4xx/429 and schema failures are not retried | Implemented locally. A billed/ambiguous network failure can still make the second attempt add cost. |
| Usage evidence | Successful input/output token counts and safe failure metadata stored in `ai_usage_events` | Useful for reconciliation; no stored dollar conversion or automated quota decision. |

## Missing cost controls

After migration 010 and the Function update, the remaining gaps are a monthly request/token/cost quota or automatic dollar-based circuit breaker, exact tokenizer-based input limit, cumulative retry budget, and alert automation from `ai_usage_events`. The daily counters bound accepted provider generations but do not calculate billed dollars.

## Recommended $5/month operating values

These are follow-up implementation/configuration recommendations, not current code or authorization to change Production:

1. Keep the implemented exact `gpt-4.1-mini` allowlist and mirror it in OpenAI project Model Usage. Consider a snapshot only through a separately reviewed contract change.
2. Keep the 4,000-character message and 30,000-character context caps initially. Keep 1,200 output tokens until real proposal truncation data supports lowering it; test 800–1,000 as a later optimization.
3. Keep the implemented 5 requests/profile/5 minutes and 20/community/5 minutes, plus 25/profile/UTC day and 100/community/UTC day. Revisit only from measured usage and active-user count.
4. Warn operationally at $2, investigate/restrict at $4, and disable new AI generation at the application boundary at the approved threshold if a hard operational control is required. Preserve review/execution of already-saved proposals. This circuit breaker is separate from, and must not be described as, an OpenAI billing guarantee.
5. Alert on retry ratio above 5%, provider error spikes, unexpected model IDs, or missing token usage. Review OpenAI Costs daily during launch week and reconcile weekly with `ai_usage_events`.
6. Keep two attempts only for transient network/5xx failures; do not retry 4xx/429/schema failures. Consider a single-attempt Production policy if retry telemetry shows material duplicate cost.

At the documented `gpt-4.1-mini` rates of $0.40 per million input tokens and $1.60 per million output tokens, a conservative 10,000-input/1,200-output-token request is approximately $0.00592. The $5 target therefore represents roughly 844 such single-attempt requests before overhead/variation, or fewer when retries occur. This is planning arithmetic, not a billing forecast.

## Enablement decision

The local release candidate now has an exact model allowlist and atomic daily/server-side quotas, but it still does not technically enforce a dollar-denominated $5/month envelope. A monthly circuit breaker remains a follow-up if a hard operational stop is required. Production Supabase, Functions, OpenAI project, key and settings remain unchanged.
