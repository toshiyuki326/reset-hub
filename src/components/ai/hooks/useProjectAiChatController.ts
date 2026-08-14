import {useCallback,useEffect,useReducer} from 'react';
import * as repository from '../../../repositories/aiConversationRepository';
import {createProjectAiSession,executeProjectAiProposal,sendProjectAiMessage} from '../../../services/projectAiService';
import type {BuiltContext} from '../../../types/contextBuilderTypes';
import {initialProjectAiState,projectAiReducer} from '../projectAiController';

export function useProjectAiChatController(input:{communityId:string;profileId:string;context:BuiltContext;initialSessions:repository.ConversationSession[]}){
  const [state,dispatch]=useReducer(projectAiReducer,initialProjectAiState);
  useEffect(()=>{dispatch({type:'loaded',sessions:input.initialSessions})},[input.initialSessions]);
  useEffect(()=>{const id=state.activeSessionId;if(!id)return;dispatch({type:'busy',status:'loading'});repository.listConversationMessages(id).then(messages=>dispatch({type:'session-selected',sessionId:id,messages})).catch(()=>dispatch({type:'failed',error:'会話を読み込めませんでした。'}))},[state.activeSessionId]);
  const newSession=useCallback(async()=>{dispatch({type:'busy',status:'saving'});try{const session=await createProjectAiSession({communityId:input.communityId,profileId:input.profileId,title:'Project AI conversation',context:input.context});dispatch({type:'session-created',session})}catch{dispatch({type:'failed',error:'会話を作成できませんでした。'})}},[input]);
  const selectSession=useCallback((sessionId:string)=>dispatch({type:'session-requested',sessionId}),[]);
  const sendMessage=useCallback(async(content:string)=>{if(!state.activeSessionId)return;dispatch({type:'responding',input:content});try{const messages=await sendProjectAiMessage(state.activeSessionId,content);dispatch({type:'conversation-updated',messages})}catch{dispatch({type:'failed',error:'AI応答に失敗しました。もう一度お試しください。'})}},[state.activeSessionId]);
  const retry=useCallback(async()=>{if(!state.lastInput||!state.activeSessionId)return;dispatch({type:'responding',input:state.lastInput});try{const messages=await sendProjectAiMessage(state.activeSessionId,state.lastInput,true);dispatch({type:'conversation-updated',messages})}catch{dispatch({type:'failed',error:'AI応答に失敗しました。もう一度お試しください。'})}},[state.activeSessionId,state.lastInput]);
  const review=useCallback(async(messageId:string,decision:'approved'|'rejected')=>{dispatch({type:'busy',status:'saving'});try{const message=await repository.reviewConversationProposal(messageId,decision);dispatch({type:'message-reviewed',message})}catch{dispatch({type:'failed',error:'提案を更新できませんでした。'})}},[]);
  // Only invoked from an explicit "execute" click on an already-approved proposal (see ExecutionPanel); never automatic.
  const execute=useCallback(async(messageId:string)=>{if(!state.activeSessionId)return;dispatch({type:'busy',status:'saving'});try{const messages=await executeProjectAiProposal(state.activeSessionId,messageId);dispatch({type:'conversation-updated',messages})}catch{dispatch({type:'failed',error:'提案を実行できませんでした。'})}},[state.activeSessionId]);
  return {...state,newSession,selectSession,sendMessage,retry,review,execute};
}
