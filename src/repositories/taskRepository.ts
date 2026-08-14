import {supabase} from '../lib/supabase';import {mapTaskRow} from './mappers/taskMapper';
const db=()=>{if(!supabase)throw new Error('TaskRepository requires Supabase') ;return supabase};
export async function listTaskContracts(communityId:string){const {data,error}=await db().from('tasks').select('*').eq('community_id',communityId);if(error)throw error;return (data||[]).map(mapTaskRow)}
