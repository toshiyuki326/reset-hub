import type {ConversationMessage,ConversationSession} from '../../repositories/aiConversationRepository';

export type ProjectAiState={sessions:ConversationSession[];activeSessionId?:string;messages:ConversationMessage[];status:'idle'|'loading'|'saving'|'responding'|'error';error?:string;lastInput?:string};
export type ProjectAiAction={type:'loaded';sessions:ConversationSession[]}|{type:'session-requested';sessionId:string}|{type:'session-selected';sessionId:string;messages:ConversationMessage[]}|{type:'session-created';session:ConversationSession}|{type:'conversation-updated';messages:ConversationMessage[]}|{type:'message-reviewed';message:ConversationMessage}|{type:'responding';input:string}|{type:'busy';status:'loading'|'saving'}|{type:'failed';error:string};
export const initialProjectAiState:ProjectAiState={sessions:[],messages:[],status:'idle'};
export function projectAiReducer(state:ProjectAiState,action:ProjectAiAction):ProjectAiState{switch(action.type){case'loaded':return {...state,sessions:action.sessions,activeSessionId:action.sessions[0]?.id,status:'idle',error:undefined};case'session-requested':return {...state,activeSessionId:action.sessionId,messages:[],status:'loading',error:undefined};case'session-selected':return {...state,activeSessionId:action.sessionId,messages:action.messages,status:'idle',error:undefined};case'session-created':return {...state,sessions:[action.session,...state.sessions],activeSessionId:action.session.id,messages:[],status:'idle'};case'conversation-updated':return {...state,messages:action.messages,status:'idle',error:undefined};case'message-reviewed':return {...state,messages:state.messages.map(message=>message.id===action.message.id?action.message:message),status:'idle'};case'responding':return {...state,status:'responding',lastInput:action.input,error:undefined};case'busy':return {...state,status:action.status,error:undefined};case'failed':return {...state,status:'error',error:action.error}}}
export const isProposalReviewable=(message:ConversationMessage)=>Boolean(message.proposal&&['proposal','review'].includes(message.proposalStatus));
// The browser never mutates task/proposal state directly for execution (no direct table
// write, no direct proposal_status flip): it can only invoke the execute-ai-proposal Edge
// Function, which re-validates approval/ownership/membership server-side before acting,
// and only in response to an explicit user click (never automatically after approval).
export const isProposalExecutable=(message:ConversationMessage)=>message.proposalStatus==='approved';
export const isProposalExecuting=(message:ConversationMessage)=>message.proposalStatus==='executing';
export const isProposalExecuted=(message:ConversationMessage)=>message.proposalStatus==='executed';
export const isProposalExecutionFailed=(message:ConversationMessage)=>message.proposalStatus==='failed';
