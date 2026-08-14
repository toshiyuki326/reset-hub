export type ProposalStatus='proposal'|'review'|'approved'|'rejected'|'executed'|'failed';
export interface ActionProposal{id:string;communityId:string;kind:'create_task'|'update_task'|'create_event'|'update_document';summary:string;payload:Record<string,unknown>;status:ProposalStatus;createdAt:string;reviewedBy?:string}
export interface ExecutionResult{proposalId:string;status:'executed'|'failed';executedAt:string;errorCode?:string}
export interface ProposalExecutor{executeApproved:(proposal:ActionProposal)=>Promise<ExecutionResult>}
export const disabledProposalExecutor:ProposalExecutor={executeApproved:async()=>{throw new Error('AUTOMATIC_EXECUTION_DISABLED')}};
