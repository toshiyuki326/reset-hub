import {useCallback,useEffect,useRef,useState} from 'react';
import {ProjectAiChat} from '../components/ai/ProjectAiChat';
import type {RefreshEntity} from '../components/ai/postExecutionRefresh';
import {useStore} from '../app/Store';
import {loadProjectAiWorkspace} from '../services/projectAiService';
import type {BuiltContext,ContextBuilderInput} from '../types/contextBuilderTypes';
import type {ConversationSession} from '../repositories/aiConversationRepository';

type Workspace={input:ContextBuilderInput;context:BuiltContext;sessions:ConversationSession[]};

export default function ProjectAiPage(){
  const store=useStore();
  const {communityId,profileId,role,refreshTasks,refreshEvents}=store;
  const [workspace,setWorkspace]=useState<Workspace>();
  const [error,setError]=useState<string>();
  const goalRefreshSequence=useRef(0);
  useEffect(()=>{if(!store.communityId||!store.profileId||!store.role)return;loadProjectAiWorkspace(store.communityId,store.profileId,store.role).then(setWorkspace).catch(()=>setError('Project AIデータを読み込めませんでした。'))},[store.communityId,store.profileId,store.role]);
  const onExecutionSuccess=useCallback(async(entities:RefreshEntity[])=>{
    const refreshes:Promise<void>[]=[];
    if(entities.includes('tasks'))refreshes.push(refreshTasks());
    if(entities.includes('events'))refreshes.push(refreshEvents());
    if(entities.includes('goals')&&communityId&&profileId&&role){
      const sequence=++goalRefreshSequence.current;
      refreshes.push(loadProjectAiWorkspace(communityId,profileId,role).then(next=>{if(sequence===goalRefreshSequence.current)setWorkspace(next)}));
    }
    await Promise.all(refreshes);
  },[communityId,profileId,refreshEvents,refreshTasks,role]);
  const unavailable=!store.loading&&(!store.communityId||!store.profileId||!store.role);
  return <div className="page"><header className="page-head"><div><p>PROJECT</p><h1>Project AI</h1></div></header><p className="ai-disclaimer">実データContextをserver-side AIへ送り、回答または提案を保存します。提案は承認しても自動実行されません。</p>{error&&<div className="app-state"><p>{error}</p></div>}{unavailable&&<div className="app-state"><p>Project AIにはSupabase実データ接続が必要です。</p></div>}{!error&&!unavailable&&!workspace&&<div className="app-state"><span className="spinner"/><p>Projectデータを読み込んでいます</p></div>}{workspace&&store.communityId&&store.profileId&&<ProjectAiChat communityId={store.communityId} profileId={store.profileId} context={workspace.context} initialSessions={workspace.sessions} onExecutionSuccess={onExecutionSuccess}/>}</div>
}
