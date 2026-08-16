import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import type {SafeErrorCode} from './schema.ts';
import {validateExecutableActions, type ActionValidationDiagnostic} from './taskExecutor.ts';

export type ExecutorDiagnostic = ActionValidationDiagnostic | {
  stage: 'rpc';
  safeDbCode: string;
};

export class ExecutorError extends Error {
  constructor(public code: SafeErrorCode, public status: number, public diagnostic?: ExecutorDiagnostic) {
    super(code);
  }
}

const STATUS_BY_CODE: Record<SafeErrorCode, number> = {
  AUTHENTICATION_ERROR: 401,
  INVALID_REQUEST: 400,
  NOT_APPROVED: 409,
  ALREADY_EXECUTING: 409,
  ALREADY_EXECUTED: 409,
  UNSUPPORTED_ACTION: 422,
  INVALID_ACTION: 422,
  TARGET_NOT_FOUND: 404,
  COMMUNITY_MISMATCH: 403,
  PERMISSION_DENIED: 403,
  INACTIVE_MEMBER: 403,
  EXECUTION_FAILED: 502,
};

// execute_ai_proposal()/mark_ai_proposal_failed() raise these custom SQLSTATEs
// (migration 202608130006) instead of leaking Postgres error text. Anything not in
// this table (a real constraint violation, a cast failure, ...) falls back to the
// generic EXECUTION_FAILED code below.
const RPC_CODE_MAP: Record<string, SafeErrorCode> = {
  AI001: 'NOT_APPROVED',
  AI002: 'ALREADY_EXECUTING',
  AI003: 'ALREADY_EXECUTED',
  AI004: 'UNSUPPORTED_ACTION',
  AI005: 'INVALID_ACTION',
  AI006: 'TARGET_NOT_FOUND',
  AI007: 'COMMUNITY_MISMATCH',
  AI008: 'PERMISSION_DENIED',
  AI009: 'INACTIVE_MEMBER',
};

// Codes meaning the atomic claim never happened (proposal was never flipped to
// 'executing'), so there is nothing to record as a terminal failure.
const NO_CLAIM_CODES = new Set<SafeErrorCode>(['NOT_APPROVED', 'ALREADY_EXECUTING', 'ALREADY_EXECUTED', 'INACTIVE_MEMBER']);

export function mapRpcError(error: {code?: string}): SafeErrorCode {
  return RPC_CODE_MAP[error.code || ''] || 'EXECUTION_FAILED';
}

export async function executeApprovedProposal(
  admin: SupabaseClient,
  input: {messageId: string; profileId: string},
) {
  const {data: message, error: messageError} = await admin
    .from('ai_conversation_messages')
    .select('id,community_id,session_id,proposal,proposal_status')
    .eq('id', input.messageId)
    .maybeSingle();
  if (messageError) throw new ExecutorError('EXECUTION_FAILED', STATUS_BY_CODE.EXECUTION_FAILED);
  if (!message) throw new ExecutorError('PERMISSION_DENIED', STATUS_BY_CODE.PERMISSION_DENIED);

  const {data: session} = await admin
    .from('ai_conversation_sessions')
    .select('id,profile_id,community_id')
    .eq('id', message.session_id)
    .maybeSingle();
  if (!session || session.profile_id !== input.profileId || session.community_id !== message.community_id) {
    throw new ExecutorError('PERMISSION_DENIED', STATUS_BY_CODE.PERMISSION_DENIED);
  }

  const {data: membership} = await admin
    .from('community_members')
    .select('active')
    .eq('community_id', message.community_id)
    .eq('profile_id', input.profileId)
    .maybeSingle();
  if (!membership?.active) throw new ExecutorError('INACTIVE_MEMBER', STATUS_BY_CODE.INACTIVE_MEMBER);

  if (message.proposal_status === 'executing') throw new ExecutorError('ALREADY_EXECUTING', STATUS_BY_CODE.ALREADY_EXECUTING);
  if (message.proposal_status === 'executed') throw new ExecutorError('ALREADY_EXECUTED', STATUS_BY_CODE.ALREADY_EXECUTED);
  if (message.proposal_status !== 'approved' || !message.proposal) {
    throw new ExecutorError('NOT_APPROVED', STATUS_BY_CODE.NOT_APPROVED);
  }

  const invalid = validateExecutableActions(message.proposal);
  if (invalid) throw new ExecutorError(invalid.code, STATUS_BY_CODE[invalid.code], invalid.diagnostic);

  const {data: executed, error: rpcError} = await admin.rpc('execute_ai_proposal', {
    p_message_id: input.messageId,
    p_profile_id: input.profileId,
  });

  if (rpcError) {
    const code = mapRpcError(rpcError);
    if (!NO_CLAIM_CODES.has(code)) {
      const {error: markError} = await admin.rpc('mark_ai_proposal_failed', {
        p_message_id: input.messageId,
        p_profile_id: input.profileId,
        p_error_code: code,
      });
      if (markError) console.error('mark_ai_proposal_failed also failed', {code: markError.code});
    }
    console.error('execute_ai_proposal rejected', {code, pgCode: rpcError.code});
    throw new ExecutorError(code, STATUS_BY_CODE[code], {stage: 'rpc', safeDbCode: rpcError.code || 'unknown'});
  }

  return executed;
}
