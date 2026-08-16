import {Plus} from 'lucide-react';
import type {ConversationSession} from '../../repositories/aiConversationRepository';
import type {BuiltContext} from '../../types/contextBuilderTypes';
import {Button} from '../ui';
import {ConversationPanel} from './ConversationPanel';
import {MultiActionPanel} from './MultiActionPanel';
import {ReasoningPanel} from './ReasoningPanel';
import {useProjectAiChatController} from './hooks/useProjectAiChatController';
import type {RefreshEntity} from './postExecutionRefresh';

export function ProjectAiChat({communityId,profileId,context,initialSessions,onExecutionSuccess}:{communityId:string;profileId:string;context:BuiltContext;initialSessions:ConversationSession[];onExecutionSuccess?:(entities:RefreshEntity[])=>Promise<void>}){
  const state=useProjectAiChatController({communityId,profileId,context,initialSessions,onExecutionSuccess});
  const busy=['loading','saving','responding'].includes(state.status);
  return <div className="ai-layout"><aside className="ai-card ai-sessions"><div className="section-title"><h2>会話</h2><Button onClick={()=>void state.newSession()} disabled={busy}><Plus/> 新規</Button></div>{state.sessions.length?state.sessions.map(session=><button className={session.id===state.activeSessionId?'active':''} key={session.id} onClick={()=>state.selectSession(session.id)}><strong>{session.title}</strong><small>{new Date(session.updatedAt).toLocaleDateString('ja-JP')}</small></button>):<p className="ai-note">会話はまだありません。</p>}</aside><div className="ai-main">{state.error&&<div className="ai-error" role="alert"><p>{state.error}</p><Button className="secondary" onClick={()=>void state.retry()} disabled={!state.lastInput}>再試行</Button></div>}{state.notice&&<div className="ai-error" role="status"><p>{state.notice}</p></div>}<ReasoningPanel context={context}/><ConversationPanel messages={state.messages} disabled={busy} responding={state.status==='responding'} canAdd={Boolean(state.activeSessionId)} onSend={state.sendMessage}/><MultiActionPanel messages={state.messages} disabled={busy} onReview={(id,decision)=>void state.review(id,decision)} onExecute={id=>void state.execute(id)}/></div></div>
}
