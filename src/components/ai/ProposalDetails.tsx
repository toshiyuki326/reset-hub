import type {Json} from '../../types/database';
import {dateTimeLabel} from '../../lib/dates';

const labels:Record<string,string>={create_task:'タスクを作成',update_task:'タスクを更新',create_goal:'ゴールを作成',update_goal:'ゴールを更新',create_event:'イベントを作成'};
const statusLabels:Record<string,string>={todo:'未着手',in_progress:'進行中',waiting:'確認待ち',done:'完了',cancelled:'キャンセル',draft:'下書き',active:'進行中',completed:'完了'};
const record=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;

export function ProposalDetails({proposal}:{proposal:Json}){
  const root=record(proposal);const actions=Array.isArray(root?.actions)?root.actions.map(record).filter((value):value is Record<string,unknown>=>Boolean(value)):[];
  return <div className="ai-proposal-details">
    {typeof root?.title==='string'&&<h4>{root.title}</h4>}
    {typeof root?.summary==='string'&&<p>{root.summary}</p>}
    <ol>{actions.map((action,index)=>{const payload=record(action.payload)||{};const kind=String(action.kind||'unknown');return <li key={`${kind}-${index}`}>
      <strong>{labels[kind]||kind}</strong>
      {typeof payload.title==='string'&&<span>{payload.title}</span>}
      {typeof payload.description==='string'&&payload.description&&<small>{payload.description}</small>}
      {typeof payload.status==='string'&&<small>ステータス: {statusLabels[payload.status]||payload.status}</small>}
      {typeof payload.priority==='string'&&<small>優先度: {payload.priority}</small>}
      {typeof payload.due_date==='string'&&<small>期限: {dateTimeLabel(payload.due_date)}</small>}
      {typeof payload.start_at==='string'&&<small>開始: {dateTimeLabel(payload.start_at)}</small>}
      {typeof payload.end_at==='string'&&<small>終了: {dateTimeLabel(payload.end_at)}</small>}
      {typeof payload.target_date==='string'&&<small>目標日: {payload.target_date}</small>}
      {typeof payload.location==='string'&&payload.location&&<small>場所: {payload.location}</small>}
      {(kind==='update_task'||kind==='update_goal')&&typeof action.target==='string'&&<small>対象ID: {action.target}</small>}
    </li>})}</ol>
    <details><summary>技術詳細（JSON）</summary><pre>{JSON.stringify(proposal,null,2)}</pre></details>
  </div>;
}
