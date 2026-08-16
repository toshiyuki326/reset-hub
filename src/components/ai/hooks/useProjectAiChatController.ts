import {useCallback,useEffect,useReducer,useRef} from 'react';
import * as repository from '../../../repositories/aiConversationRepository';
import {createProjectAiSession,executeProjectAiProposal,sendProjectAiMessage} from '../../../services/projectAiService';
import {createSingleFlight} from '../../../lib/singleFlight';
import type {BuiltContext} from '../../../types/contextBuilderTypes';
import {initialProjectAiState,projectAiReducer} from '../projectAiController';
import {affectedEntitiesForMessage,type RefreshEntity} from '../postExecutionRefresh';

export function useProjectAiChatController(input:{communityId:string;profileId:string;context:BuiltContext;initialSessions:repository.ConversationSession[];onExecutionSuccess?:(entities:RefreshEntity[])=>Promise<void>}){
  const [state,dispatch]=useReducer(projectAiReducer,initialProjectAiState);
  const once=useRef(createSingleFlight()).current;
  const onExecutionSuccess=input.onExecutionSuccess;
  useEffect(()=>{dispatch({type:'loaded',sessions:input.initialSessions})},[input.initialSessions]);
  useEffect(()=>{const id=state.activeSessionId;if(!id)return;dispatch({type:'busy',status:'loading'});repository.listConversationMessages(id).then(messages=>dispatch({type:'session-selected',sessionId:id,messages})).catch(()=>dispatch({type:'failed',error:'会話を読み込めませんでした。'}))},[state.activeSessionId]);
  const newSession=useCallback(()=>once('new-session',async()=>{dispatch({type:'busy',status:'saving'});try{const title=`Project AI ${new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date())}`;const session=await createProjectAiSession({communityId:input.communityId,profileId:input.profileId,title,context:input.context});dispatch({type:'session-created',session})}catch{dispatch({type:'failed',error:'会話を作成できませんでした。'})}}),[input,once]);
  const selectSession=useCallback((sessionId:string)=>dispatch({type:'session-requested',sessionId}),[]);
  const sendMessage=useCallback(async(content:string)=>{if(!state.activeSessionId)return;return once(`send:${state.activeSessionId}`,async()=>{dispatch({type:'responding',input:content});try{const messages=await sendProjectAiMessage(state.activeSessionId!,content);dispatch({type:'conversation-updated',messages})}catch{dispatch({type:'failed',error:'AI応答に失敗しました。もう一度お試しください。'})}})},[once,state.activeSessionId]);
  const retry=useCallback(async()=>{if(!state.lastInput||!state.activeSessionId)return;return once(`send:${state.activeSessionId}`,async()=>{dispatch({type:'responding',input:state.lastInput!});try{const messages=await sendProjectAiMessage(state.activeSessionId!,state.lastInput!,true);dispatch({type:'conversation-updated',messages})}catch{dispatch({type:'failed',error:'AI応答に失敗しました。もう一度お試しください。'})}})},[once,state.activeSessionId,state.lastInput]);
  const review=useCallback((messageId:string,decision:'approved'|'rejected')=>once(`review:${messageId}`,async()=>{dispatch({type:'busy',status:'saving'});try{const message=await repository.reviewConversationProposal(messageId,decision);dispatch({type:'message-reviewed',message})}catch{dispatch({type:'failed',error:'提案を更新できませんでした。'})}}),[once]);
  // Only invoked from an explicit "execute" click on an already-approved proposal (see ExecutionPanel); never automatic.
  const execute=useCallback(async(messageId:string)=>{if(!state.activeSessionId)return;const entities=affectedEntitiesForMessage(state.messages.find(message=>message.id===messageId));return once(`execute:${messageId}`,async()=>{dispatch({type:'busy',status:'saving'});let messages:repository.ConversationMessage[];try{messages=await executeProjectAiProposal(state.activeSessionId!,messageId);dispatch({type:'conversation-updated',messages})}catch{dispatch({type:'failed',error:'提案を実行できませんでした。'});return}try{await onExecutionSuccess?.(entities)}catch{dispatch({type:'refresh-failed',notice:'実行は完了しましたが、表示更新に失敗しました。画面を再読み込みしてください。'})}})},[onExecutionSuccess,once,state.activeSessionId,state.messages]);
  return {...state,newSession,selectSession,sendMessage,retry,review,execute};
}
