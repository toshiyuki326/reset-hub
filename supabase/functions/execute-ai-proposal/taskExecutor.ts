import {allowedProposalKinds,proposalActionSchema} from '../_shared/actionContract.ts';
export const executableActionKinds = allowedProposalKinds;
export type ActionValidationDiagnostic = {
  stage: 'proposal_schema' | 'action_kind' | 'action_schema';
  actionIndex?: number;
  actionKind?: string;
  payloadKeys?: string[];
  issues?: Array<{path: string; code: string; expected?: string}>;
};
export type ActionValidationFailure = {code: 'UNSUPPORTED_ACTION' | 'INVALID_ACTION'; diagnostic: ActionValidationDiagnostic};

const safeIssues = (error: {issues:Array<{path:PropertyKey[];code:string;expected?:unknown}>}) => error.issues.slice(0, 8).map(issue => ({
  path: issue.path.join('.'),
  code: issue.code,
  ...('expected' in issue && typeof issue.expected === 'string' ? {expected: issue.expected} : {}),
}));
const payloadKeys = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value)
  ? Object.keys(value as Record<string, unknown>).sort()
  : undefined;

export function validateExecutableActions(proposal: unknown): ActionValidationFailure | null {
  if(proposal===null||typeof proposal!=='object'||Array.isArray(proposal)){
    return {code:'INVALID_ACTION',diagnostic:{stage:'proposal_schema'}};
  }
  const actions=(proposal as {actions?:unknown}).actions;
  if(!Array.isArray(actions)||actions.length<1||actions.length>10){
    return {code:'INVALID_ACTION',diagnostic:{stage:'proposal_schema'}};
  }
  for (const [actionIndex, action] of actions.entries()) {
    if(action===null||typeof action!=='object'||Array.isArray(action)){
      return {code:'INVALID_ACTION',diagnostic:{stage:'action_schema',actionIndex}};
    }
    const candidate=action as {kind?:unknown;payload?:unknown};
    const actionKind=typeof candidate.kind==='string'?candidate.kind:undefined;
    const diagnosticBase = {actionIndex, ...(actionKind?{actionKind}:{}), payloadKeys: payloadKeys(candidate.payload)};
    if (actionKind&&!(executableActionKinds as readonly string[]).includes(actionKind)) {
      return {code: 'UNSUPPORTED_ACTION', diagnostic: {stage: 'action_kind', ...diagnosticBase}};
    }
    const validated = proposalActionSchema.safeParse(action);
    if (!validated.success) {
      return {code: 'INVALID_ACTION', diagnostic: {stage: 'action_schema', ...diagnosticBase, issues: safeIssues(validated.error)}};
    }
  }
  return null;
}
