import {z} from 'npm:zod@4.0.17';

// Only the fields create_task/update_task actually use. The stored proposal payload
// carries the wider project-ai-chat shape (goal_id, location, start_at, ...); unknown
// keys are ignored here rather than rejected, since this schema intentionally covers
// a subset of allowed proposal kinds.
const taskPayloadSchema = z.object({
  title: z.string().trim().max(160).nullable(),
  description: z.string().max(5000).nullable(),
  status: z.enum(['todo', 'in_progress', 'waiting', 'done', 'cancelled']).nullable(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).nullable(),
  assignee_id: z.string().uuid().nullable(),
  due_date: z.string().nullable(),
});

export const executableActionKinds = ['create_task', 'update_task'] as const;

const executableActionSchema = z.object({
  kind: z.string(),
  target: z.string().nullable().optional(),
  payload: taskPayloadSchema,
});

export const executableProposalSchema = z.object({
  actions: z.array(executableActionSchema).min(1).max(10),
});

export type ActionValidationFailure = {code: 'UNSUPPORTED_ACTION' | 'INVALID_ACTION'};

/**
 * Defense-in-depth pre-check run before the atomic claim RPC. This is not the
 * source of truth — execute_ai_proposal() re-validates every field inside the same
 * transaction as the write — but it lets malformed or unsupported proposals fail
 * fast with a clean error code, without spending a claim attempt.
 */
export function validateExecutableActions(proposal: unknown): ActionValidationFailure | null {
  const parsed = executableProposalSchema.safeParse(proposal);
  if (!parsed.success) return {code: 'INVALID_ACTION'};

  for (const action of parsed.data.actions) {
    if (!(executableActionKinds as readonly string[]).includes(action.kind)) {
      return {code: 'UNSUPPORTED_ACTION'};
    }
    if (action.kind === 'create_task' && !action.payload.title?.trim()) {
      return {code: 'INVALID_ACTION'};
    }
    if (action.kind === 'update_task' && !action.target?.trim()) {
      return {code: 'INVALID_ACTION'};
    }
  }
  return null;
}
