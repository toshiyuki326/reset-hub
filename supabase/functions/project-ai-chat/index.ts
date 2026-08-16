import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {z} from 'npm:zod@4.0.17';
import {buildProjectAiInput} from './prompt.ts';
import {ProviderError,requestOpenAi} from './provider.ts';
import {mapProjectAiContext} from './context.ts';
import {browserCorsHeaders,browserCorsPreflight} from '../_shared/cors.ts';

const requestSchema=z.object({session_id:z.string().uuid(),message:z.string().trim().min(1).max(4000),retry:z.boolean().optional().default(false)}).strict();
type ErrorCode='AUTHENTICATION_ERROR'|'INACTIVE_MEMBER'|'SESSION_FORBIDDEN'|'RATE_LIMIT'|'PROVIDER_UNAVAILABLE'|'INVALID_STRUCTURED_RESPONSE'|'INVALID_REQUEST';
const reply=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...browserCorsHeaders(req),'Content-Type':'application/json'}});
const generic=(req:Request,code:ErrorCode,status:number)=>reply(req,{error:'AI_RESPONSE_FAILED',code,message:'AI応答に失敗しました。もう一度お試しください。'},status);

Deno.serve(async req=>{
  const requestId=crypto.randomUUID();const startedAt=Date.now();
  if(req.method==='OPTIONS')return browserCorsPreflight(req);
  if(req.method!=='POST')return generic(req,'INVALID_REQUEST',405);
  if(Number(req.headers.get('content-length')||0)>16_000)return generic(req,'INVALID_REQUEST',413);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  let profileId:string|undefined;let communityId:string|undefined;let sessionId:string|undefined;let model=Deno.env.get('OPENAI_MODEL')||'gpt-4.1-mini';
  try{
    const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/,'');
    if(!jwt)return generic(req,'AUTHENTICATION_ERROR',401);
    const {data:{user},error:userError}=await admin.auth.getUser(jwt);
    if(userError||!user)return generic(req,'AUTHENTICATION_ERROR',401);
    const parsed=requestSchema.safeParse(await req.json().catch(()=>null));
    if(!parsed.success)return generic(req,'INVALID_REQUEST',400);
    sessionId=parsed.data.session_id;

    const {data:session}=await admin.from('ai_conversation_sessions').select('id,community_id,profile_id').eq('id',sessionId).maybeSingle();
    if(!session)return generic(req,'SESSION_FORBIDDEN',403);
    const {data:profile}=await admin.from('profiles').select('id,display_name').eq('auth_user_id',user.id).maybeSingle();
    if(!profile||profile.id!==session.profile_id)return generic(req,'SESSION_FORBIDDEN',403);
    profileId=profile.id;communityId=session.community_id;
    const {data:membership}=await admin.from('community_members').select('role,active').eq('community_id',communityId).eq('profile_id',profileId).eq('active',true).maybeSingle();
    if(!membership)return generic(req,'INACTIVE_MEMBER',403);
    const {error:rateError}=await admin.rpc('claim_project_ai_request',{p_community_id:communityId,p_profile_id:profileId});
    if(rateError)return generic(req,rateError.code==='AI010'?'RATE_LIMIT':'PROVIDER_UNAVAILABLE',rateError.code==='AI010'?429:502);

    const [communityResult,tasksResult,goalsResult,kpisResult,eventsResult,activityResult,historyResult]=await Promise.all([
      admin.from('communities').select('id,name,slug').eq('id',communityId).single(),
      admin.from('tasks').select('id,title,description,status,priority,assignee_id,due_date,event_id,source_type,source_id,created_at,updated_at,completed_at,created_by').eq('community_id',communityId).not('status','in','(done,cancelled)').order('due_date').limit(100),
      admin.from('project_goals').select('id,community_id,title,description,status,target_date').eq('community_id',communityId).order('created_at').limit(50),
      admin.from('project_kpis').select('id,goal_id,name,unit,target_value,project_kpi_entries(value,recorded_at,note)').eq('community_id',communityId).order('created_at').limit(50),
      admin.from('events').select('id,title,description,location,start_at,end_at,all_day').eq('community_id',communityId).gte('start_at',new Date(Date.now()-7*86400000).toISOString()).order('start_at').limit(50),
      admin.from('activity_logs').select('action,entity_type,created_at,metadata').eq('community_id',communityId).order('created_at',{ascending:false}).limit(50),
      admin.from('ai_conversation_messages').select('role,content,created_at').eq('session_id',sessionId).order('created_at',{ascending:false}).limit(20),
    ]);
    for(const result of [communityResult,tasksResult,goalsResult,kpisResult,eventsResult,activityResult,historyResult])if(result.error)throw new Error('CONTEXT_LOAD_FAILED');
    const context=mapProjectAiContext({generatedAt:new Date().toISOString(),profile,role:membership.role,community:communityResult.data!,tasks:tasksResult.data||[],goals:goalsResult.data||[],kpis:kpisResult.data||[],events:eventsResult.data||[],activity:activityResult.data||[],history:historyResult.data||[]});

    if(!parsed.data.retry){const {error}=await admin.from('ai_conversation_messages').insert({community_id:communityId,session_id:sessionId,role:'user',content:parsed.data.message,proposal_status:'none'});if(error)throw new Error('MESSAGE_SAVE_FAILED')}
    const result=await requestOpenAi(buildProjectAiInput(context,parsed.data.message));model=result.model;
    const structured=result.response;const content=structured.type==='message'?structured.content!:structured.summary!;
    const proposal=structured.type==='proposal'?{title:structured.title,summary:structured.summary,actions:structured.actions}:null;
    const {data:assistant,error:assistantError}=await admin.from('ai_conversation_messages').insert({community_id:communityId,session_id:sessionId,role:'assistant',content,proposal,proposal_status:proposal?'proposal':'none'}).select('*').single();
    if(assistantError)throw new Error('MESSAGE_SAVE_FAILED');
    await admin.from('ai_conversation_sessions').update({updated_at:new Date().toISOString()}).eq('id',sessionId);
    await admin.from('ai_usage_events').insert({community_id:communityId,profile_id:profileId,session_id:sessionId,provider:'openai',model,operation:structured.type,input_units:result.inputTokens,output_units:result.outputTokens,metadata:{success:true,response_type:structured.type,request_id:requestId,duration_ms:Date.now()-startedAt}});
    console.info('project-ai-chat completed',{requestId,responseType:structured.type,model,durationMs:Date.now()-startedAt});
    return reply(req,{message:assistant});
  }catch(error){
    const code:ErrorCode=error instanceof ProviderError?error.code:'PROVIDER_UNAVAILABLE';
    if(communityId&&profileId)await admin.from('ai_usage_events').insert({community_id:communityId,profile_id:profileId,session_id:sessionId,provider:'openai',model,operation:'chat',input_units:0,output_units:0,metadata:{success:false,error_code:code,request_id:requestId,duration_ms:Date.now()-startedAt}});
    console.error('project-ai-chat failed',{requestId,code,durationMs:Date.now()-startedAt,...(error instanceof ProviderError&&error.diagnostic?{diagnostic:error.diagnostic}:{})});return generic(req,code,code==='RATE_LIMIT'?429:502);
  }
});
