# Release Candidate Architecture

## Runtime flow

1. The authenticated browser creates/selects an owned `ai_conversation_session`.
2. `project-ai-chat` validates the JWT, session owner and active membership, then atomically claims a rate-limit slot.
3. The function rebuilds bounded context from the session community: identity/role, tasks, goals, KPIs and entries, events, recent activity and the latest 20 conversation messages. Documents and Project remain absent because no persistence model exists.
4. OpenAI returns strict structured output. The function persists either an assistant message or a proposal; it never mutates operational tables.
5. A human approves/rejects through `review_ai_proposal`. The approved payload is immutable at the database trigger boundary.
6. An explicit second confirmation invokes `execute-ai-proposal` with only `message_id`.
7. The service-only `execute_ai_proposal` RPC locks the message, re-derives ownership/membership/community and performs its fixed action allowlist in one transaction.
8. The same transaction writes audit snapshots and marks the proposal executed. Any error rolls back the claim and every action.

## Supported internal actions

- `create_task`: active session owner; server fixes community and creator.
- `update_task`: owner/admin, task creator, or task assignee; same-community target only.
- `create_goal` / `update_goal`: owner/admin only; same-community target only.
- `create_event`: owner/admin only; creates the internal event record only.

There is no generic SQL executor and no proposal-controlled table or column name.

## External effects

Google Calendar, LINE and email are outside this executor. Creating an internal event does not trigger external synchronization. Any future external action requires a separate request, confirmation and dedicated function.

## Performance boundaries

All application pages are route-level lazy chunks. Project AI input is bounded by database query limits, 20 history messages and a 30,000-character serialized context ceiling.
