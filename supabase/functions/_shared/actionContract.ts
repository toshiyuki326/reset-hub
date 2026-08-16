import {z} from 'npm:zod@4.0.17';

export const allowedProposalKinds=['create_task','update_task','create_goal','update_goal','create_event'] as const;

const nullableText=(max:number)=>z.string().max(max).nullable();
const taskStatus=z.enum(['todo','in_progress','waiting','done','cancelled']).nullable();
const goalStatus=z.enum(['draft','active','completed','cancelled']).nullable();
const createTarget=(entity:'task'|'goal'|'event')=>z.string().min(1).max(160)
  .refine(value=>value===entity||z.string().uuid().safeParse(value).success);
const entityTarget=z.string().uuid();

export const createTaskPayloadSchema=z.object({
  title:z.string().trim().min(1).max(160),description:nullableText(5000),status:taskStatus,
  priority:z.enum(['low','medium','high','urgent']).nullable(),due_date:z.string().datetime({offset:true}).nullable(),
  assignee_id:z.string().uuid().nullable(),
}).strict();
export const updateTaskPayloadSchema=z.object({
  title:nullableText(160),description:nullableText(5000),status:taskStatus,
  priority:z.enum(['low','medium','high','urgent']).nullable(),due_date:z.string().datetime({offset:true}).nullable(),
  assignee_id:z.string().uuid().nullable(),
}).strict();
export const createGoalPayloadSchema=z.object({
  title:z.string().trim().min(1).max(160),description:nullableText(5000),status:goalStatus,
  target_date:z.string().date().nullable(),
}).strict();
export const updateGoalPayloadSchema=z.object({
  title:nullableText(160),description:nullableText(5000),status:goalStatus,
  target_date:z.string().date().nullable(),
}).strict();
export const createEventPayloadSchema=z.object({
  title:z.string().trim().min(1).max(160),description:nullableText(5000),
  start_at:z.string().datetime({offset:true}),end_at:z.string().datetime({offset:true}).nullable(),
  all_day:z.boolean().nullable(),location:nullableText(500),
}).strict();

export const proposalActionSchema=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('create_task'),target:createTarget('task'),payload:createTaskPayloadSchema}).strict(),
  z.object({kind:z.literal('update_task'),target:entityTarget,payload:updateTaskPayloadSchema}).strict(),
  z.object({kind:z.literal('create_goal'),target:createTarget('goal'),payload:createGoalPayloadSchema}).strict(),
  z.object({kind:z.literal('update_goal'),target:entityTarget,payload:updateGoalPayloadSchema}).strict(),
  z.object({kind:z.literal('create_event'),target:createTarget('event'),payload:createEventPayloadSchema}).strict(),
]).superRefine((action,ctx)=>{
  if(action.kind==='create_event'&&action.payload.end_at&&Date.parse(action.payload.end_at)<Date.parse(action.payload.start_at)){
    ctx.addIssue({code:'custom',path:['payload','end_at'],message:'end before start'});
  }
});

const nullableString={type:['string','null']} as const;
const nullableUuid={anyOf:[{type:'string',format:'uuid'},{type:'null'}]} as const;
const nullableDateTime={anyOf:[{type:'string',format:'date-time'},{type:'null'}]} as const;
const nullableDate={anyOf:[{type:'string',format:'date'},{type:'null'}]} as const;
const taskStatusJson={type:['string','null'],enum:['todo','in_progress','waiting','done','cancelled',null]} as const;
const goalStatusJson={type:['string','null'],enum:['draft','active','completed','cancelled',null]} as const;
const taskProperties={description:nullableString,status:taskStatusJson,priority:{type:['string','null'],enum:['low','medium','high','urgent',null]},due_date:nullableDateTime,assignee_id:nullableUuid} as const;
const goalProperties={description:nullableString,status:goalStatusJson,target_date:nullableDate} as const;
const eventProperties={description:nullableString,start_at:{type:'string',format:'date-time'},end_at:nullableDateTime,all_day:{type:['boolean','null']},location:nullableString} as const;
const createTaskPayloadJsonSchema={type:'object',additionalProperties:false,required:['title',...Object.keys(taskProperties)],properties:{title:{type:'string',minLength:1,maxLength:160},...taskProperties}} as const;
const updateTaskPayloadJsonSchema={type:'object',additionalProperties:false,required:['title',...Object.keys(taskProperties)],properties:{title:nullableString,...taskProperties}} as const;
const createGoalPayloadJsonSchema={type:'object',additionalProperties:false,required:['title',...Object.keys(goalProperties)],properties:{title:{type:'string',minLength:1,maxLength:160},...goalProperties}} as const;
const updateGoalPayloadJsonSchema={type:'object',additionalProperties:false,required:['title',...Object.keys(goalProperties)],properties:{title:nullableString,...goalProperties}} as const;
const createEventPayloadJsonSchema={type:'object',additionalProperties:false,required:['title',...Object.keys(eventProperties)],properties:{title:{type:'string',minLength:1,maxLength:160},...eventProperties}} as const;
const createTargetJson=(entity:'task'|'goal'|'event')=>({anyOf:[{type:'string',enum:[entity]},{type:'string',format:'uuid'}]}) as const;
const actionVariant=(kind:string,target:Record<string,unknown>,payload:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:['kind','target','payload'],properties:{kind:{type:'string',enum:[kind]},target,payload}}) as const;
export const proposalActionJsonSchema={anyOf:[
  actionVariant('create_task',createTargetJson('task'),createTaskPayloadJsonSchema),
  actionVariant('update_task',{type:'string',format:'uuid'},updateTaskPayloadJsonSchema),
  actionVariant('create_goal',createTargetJson('goal'),createGoalPayloadJsonSchema),
  actionVariant('update_goal',{type:'string',format:'uuid'},updateGoalPayloadJsonSchema),
  actionVariant('create_event',createTargetJson('event'),createEventPayloadJsonSchema),
]} as const;
