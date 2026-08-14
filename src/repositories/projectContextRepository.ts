import {supabase} from '../lib/supabase';
import type {ProjectGoal,ProjectKpi} from '../types/contextBuilderTypes';
import {listTaskContracts} from './taskRepository';

const db=()=>{if(!supabase)throw new Error('Project context requires Supabase');return supabase};

export async function loadProjectContext(communityId:string,profileId:string,role:'owner'|'admin'|'member'){
  const [communityResult,profileResult,goalResult,kpiResult,taskResult,activityResult]=await Promise.all([
    db().from('communities').select('id,name,slug').eq('id',communityId).single(),
    db().from('profiles').select('id,display_name').eq('id',profileId).single(),
    db().from('project_goals').select('*').eq('community_id',communityId).order('created_at'),
    db().from('project_kpis').select('*,project_kpi_entries(value,recorded_at,note)').eq('community_id',communityId).order('created_at'),
    listTaskContracts(communityId),
    db().from('activity_logs').select('action,entity_type,created_at,metadata').eq('community_id',communityId).order('created_at',{ascending:false}).limit(50)
  ]);
  for(const result of [communityResult,profileResult,goalResult,kpiResult,activityResult])if(result.error)throw result.error;
  const community=communityResult.data!;const profile=profileResult.data!;
  const goals:ProjectGoal[]=(goalResult.data||[]).map(row=>({id:row.id,communityId:row.community_id,title:row.title,description:row.description,status:row.status,targetDate:row.target_date||undefined}));
  const kpis:ProjectKpi[]=(kpiResult.data||[]).map(row=>({id:row.id,goalId:row.goal_id,name:row.name,unit:row.unit,targetValue:row.target_value===null?undefined:Number(row.target_value),entries:((row.project_kpi_entries||[]) as Array<{value:number;recorded_at:string;note:string}>).map(entry=>({value:Number(entry.value),recordedAt:entry.recorded_at,note:entry.note}))}));
  return {currentUser:{id:profile.id,displayName:profile.display_name,role},community:{id:community.id,name:community.name,slug:community.slug},goals,kpis,tasks:taskResult,documents:[],conversationHistory:[],relevantActivity:(activityResult.data||[]).map(row=>({action:row.action,entityType:row.entity_type,createdAt:row.created_at,metadata:(row.metadata||{}) as Record<string,unknown>}))};
}
