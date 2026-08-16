# Project AI Canonical Action Contract

The same action-specific Zod contract is used when validating OpenAI Structured
Output and immediately before Executor RPC dispatch. Every payload is strict;
fields from another action family and unknown keys are rejected.

| Action | Field | AI JSON Schema / Zod | Executor / RPC / DB | Frontend | Semantics |
|---|---|---|---|---|---|
| create_task | title | string, required | required → `tasks.title text` | title | new task title |
| create_task | description | string/null, required | optional value → `tasks.description text` | description | task details |
| create_task | status | task enum/null, required | default `todo` → `task_status` | localized label | canonical DB status |
| create_task | priority | task priority/null, required | default `medium` → `task_priority` | priority | task priority |
| create_task | due_date | ISO date-time/null, required | `timestamptz` | exact JST time | task deadline |
| create_task | assignee_id | UUID/null, required | active same-community member FK | identifier | task assignee |
| update_task | target | UUID, required | locked same-community `tasks.id` | target ID | task identifier; immutable |
| update_task | payload | nullable title/description/status/priority/due_date/assignee_id | non-null patch fields only | changed fields | task-only patch |
| create_goal | title | string, required | required → `project_goals.title text` | title | new goal title |
| create_goal | description | string/null, required | → `project_goals.description text` | description | goal details |
| create_goal | status | goal enum/null, required | default `draft` → `goal_status` | localized label | canonical goal state |
| create_goal | target_date | ISO date/null, required | → `project_goals.target_date date` | date only | goal target date; never `due_date` |
| update_goal | target | UUID, required | locked same-community `project_goals.id` | target ID | goal identifier; immutable |
| update_goal | payload | nullable title/description/status/target_date | owner/admin patch | changed fields | goal-only patch |
| create_event | title | string, required | required → `events.title text` | title | event title |
| create_event | description | string/null, required | → `events.description text` | description | event details |
| create_event | start_at | ISO date-time, required | → `events.start_at timestamptz` | exact JST time | event start |
| create_event | end_at | ISO date-time/null, required | must be >= start → `events.end_at` | exact JST time | event end |
| create_event | all_day | boolean/null, required | default false → `events.all_day` | all-day state | event time mode |
| create_event | location | string/null, required | → `events.location text` | location | internal event location |

Create targets accept only their entity literal (`task`, `goal`, `event`) or a
UUID community identifier. Update targets accept only an entity UUID. Task-only
fields (`due_date`, `priority`, `assignee_id`), Goal-only `target_date`, and
Event-only (`start_at`, `end_at`, `all_day`, `location`) cannot cross families.
