import * as conversations from '../repositories/aiConversationRepository';
import {loadProjectContext} from '../repositories/projectContextRepository';
import {contextBuilderService} from './contextBuilderService';
import type {Json} from '../types/database';
import {supabase} from '../lib/supabase';

export async function loadProjectAiWorkspace(communityId:string,profileId:string,role:'owner'|'admin'|'member'){
  const input=await loadProjectContext(communityId,profileId,role);
  const sessions=await conversations.listConversationSessions(communityId);
  return {input,context:contextBuilderService.build(input),sessions};
}
export async function createProjectAiSession(input:{communityId:string;profileId:string;goalId?:string;title:string;context:unknown}){
  return conversations.createConversationSession({...input,contextSnapshot:input.context as Json});
}
export async function sendProjectAiMessage(sessionId:string,message:string,retry=false){if(!supabase)throw new Error('Project AI requires Supabase');const {error}=await supabase.functions.invoke('project-ai-chat',{body:{session_id:sessionId,message,retry}});if(error)throw new Error('AI_RESPONSE_FAILED');return conversations.listConversationMessages(sessionId)}
// Only ever called from an explicit user click on an already-approved proposal (see PHASE 13: no autonomous execution).
// The Edge Function re-derives community/profile/session server-side; the browser only ever supplies message_id.
export async function executeProjectAiProposal(sessionId:string,messageId:string){if(!supabase)throw new Error('Project AI requires Supabase');const {error}=await supabase.functions.invoke('execute-ai-proposal',{body:{message_id:messageId}});if(error)throw new Error('PROPOSAL_EXECUTION_FAILED');return conversations.listConversationMessages(sessionId)}
