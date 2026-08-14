import {z} from 'npm:zod@4.0.17';

export const requestSchema = z.object({message_id: z.string().uuid()}).strict();
export type ExecuteRequest = z.infer<typeof requestSchema>;

// The complete set of safe, client-facing error codes for this function. Every
// rejection path (HTTP/auth layer and the RPC layer) resolves to exactly one of
// these; raw Postgres error text/detail is never returned to the browser.
export const safeErrorCodes = [
  'AUTHENTICATION_ERROR',
  'INVALID_REQUEST',
  'NOT_APPROVED',
  'ALREADY_EXECUTING',
  'ALREADY_EXECUTED',
  'UNSUPPORTED_ACTION',
  'INVALID_ACTION',
  'TARGET_NOT_FOUND',
  'COMMUNITY_MISMATCH',
  'PERMISSION_DENIED',
  'INACTIVE_MEMBER',
  'EXECUTION_FAILED',
] as const;
export type SafeErrorCode = (typeof safeErrorCodes)[number];
