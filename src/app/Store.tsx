/* eslint-disable react-refresh/only-export-components */
import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {toast} from 'sonner';
import {members as fixtureMembers} from '../lib/mockData';
import {readFixtures,writeFixtures} from '../lib/fixtureStorage';
import {fixtureMode} from '../lib/supabase';
import * as api from '../services/data';
import type {Event,LineMessage,Member,Task} from '../types';
import {useAuth} from './AuthProvider';

type Store={tasks:Task[];events:Event[];messages:LineMessage[];members:Member[];loading:boolean;error?:string;communityId?:string;profileId?:string;role?:Member['role'];reload:()=>Promise<void>;refreshTasks:()=>Promise<void>;refreshEvents:()=>Promise<void>;addTask:(x:Omit<Task,'id'|'createdAt'>)=>Promise<void>;updateTask:(id:string,x:Partial<Task>)=>Promise<void>;removeTask:(id:string)=>Promise<void>;addEvent:(x:Omit<Event,'id'>)=>Promise<void>;updateEvent:(id:string,x:Partial<Event>)=>Promise<void>;removeEvent:(id:string)=>Promise<void>;retryEvent:(id:string)=>Promise<void>;processMessage:(id:string,status:LineMessage['status'])=>Promise<void>};
const Context=createContext<Store|null>(null);

export function StoreProvider({children}:{children:ReactNode}){
  const auth=useAuth();
  const fixture=fixtureMode?readFixtures():{tasks:[],events:[],messages:[]};
  const [tasks,setTasks]=useState<Task[]>(fixture.tasks);
  const [events,setEvents]=useState<Event[]>(fixture.events);
  const [messages,setMessages]=useState<LineMessage[]>(fixture.messages);
  const [members,setMembers]=useState<Member[]>(fixtureMode?fixtureMembers:[]);
  const [meta,setMeta]=useState<{communityId?:string;profileId?:string;role?:Member['role']}>({});
  const [loading,setLoading]=useState(!fixtureMode);
  const [error,setError]=useState<string>();
  const refreshSequence=useRef({tasks:0,events:0});
  const reload=useCallback(async()=>{if(fixtureMode||!auth.session)return;setLoading(true);try{const w=await api.loadWorkspace();setTasks(w.tasks);setEvents(w.events);setMessages(w.messages);setMembers(w.members);setMeta({communityId:w.communityId,profileId:w.currentProfileId,role:w.role});setError(undefined)}catch(e){setError(e instanceof Error?e.message:'データを読み込めませんでした')}finally{setLoading(false)}},[auth.session]);
  const refreshTasks=useCallback(async()=>{if(fixtureMode||!meta.communityId)return;const sequence=++refreshSequence.current.tasks;const next=await api.loadTasks(meta.communityId);if(sequence===refreshSequence.current.tasks)setTasks(next)},[meta.communityId]);
  const refreshEvents=useCallback(async()=>{if(fixtureMode||!meta.communityId)return;const sequence=++refreshSequence.current.events;const next=await api.loadEvents(meta.communityId);if(sequence===refreshSequence.current.events)setEvents(next)},[meta.communityId]);
  useEffect(()=>{void reload()},[reload]);
  useEffect(()=>{if(fixtureMode)writeFixtures({tasks,events,messages})},[tasks,events,messages]);
  const run=async(fn:()=>Promise<void>,message:string)=>{try{await fn()}catch(e){toast.error(message);throw e}};
  const value=useMemo<Store>(()=>({tasks,events,messages,members,loading,error,...meta,reload,refreshTasks,refreshEvents,addTask:async x=>run(async()=>{if(fixtureMode){setTasks(v=>[...v,{...x,id:crypto.randomUUID(),createdAt:new Date().toISOString()}]);return}if(x.sourceType==='line'&&x.sourceId)await api.convertLineMessage(x.sourceId,'task',{title:x.title,description:x.description,status:x.status,priority:x.priority,assignee_id:x.assigneeId||null,due_date:x.dueDate||null});else await api.createTask(meta.communityId!,meta.profileId!,x);await reload()},'タスクを保存できませんでした。'),updateTask:async(id,x)=>run(async()=>{if(fixtureMode)setTasks(v=>v.map(t=>t.id===id?{...t,...x}:t));else{await api.patchTask(id,x);await reload()}},'タスクを更新できませんでした。'),removeTask:async id=>run(async()=>{if(fixtureMode)setTasks(v=>v.filter(t=>t.id!==id));else{await api.deleteTask(id);await reload()}},'タスクを削除できませんでした。'),addEvent:async x=>run(async()=>{if(fixtureMode)setEvents(v=>[...v,{...x,id:crypto.randomUUID()}]);else if((x as Event&{sourceId?:string}).sourceId)await api.convertLineMessage((x as Event&{sourceId?:string}).sourceId!,'event',{title:x.title,description:x.description,location:x.location,start_at:x.startAt,end_at:x.endAt,all_day:x.allDay});else await api.createEvent(meta.communityId!,meta.profileId!,x);await reload()},'イベントを保存できませんでした。'),updateEvent:async(id,x)=>run(async()=>{if(fixtureMode)setEvents(v=>v.map(e=>e.id===id?{...e,...x}:e));else{await api.patchEvent(id,x);await reload()}},'イベントを更新できませんでした。'),removeEvent:async id=>run(async()=>{if(fixtureMode)setEvents(v=>v.filter(e=>e.id!==id));else{await api.deleteEvent(id);await reload()}},'イベントを削除できませんでした。'),retryEvent:async id=>run(async()=>{if(fixtureMode)setEvents(v=>v.map(e=>e.id===id?{...e,googleSyncStatus:'synced'}:e));else{await api.retryEvent(id);await reload()}},'再同期できませんでした。'),processMessage:async(id,status)=>run(async()=>{if(fixtureMode)setMessages(v=>v.map(m=>m.id===id?{...m,status}:m));else{await api.setMessageStatus(id,status);await reload()}},'メッセージを更新できませんでした。')}),[tasks,events,messages,members,loading,error,meta,reload,refreshTasks,refreshEvents]);
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useStore=()=>{const x=useContext(Context);if(!x)throw new Error('StoreProvider missing');return x};
