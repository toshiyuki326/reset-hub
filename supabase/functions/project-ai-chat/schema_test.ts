import {assertEquals} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {aiResponseSchema,providerResponseEnvelopeSchema,responseJsonSchema} from './schema.ts';

const task={title:'準備',description:null,status:'todo' as const,priority:'medium' as const,due_date:null,assignee_id:null};
const taskPatch={title:null,description:null,status:null,priority:null,due_date:null,assignee_id:null};
const goal={title:'Goal',description:null,status:'active' as const,target_date:'2026-09-30'};
const goalPatch={title:null,description:'updated',status:null,target_date:null};
const event={title:'Event',description:null,start_at:'2026-08-20T19:00:00+09:00',end_at:'2026-08-20T20:00:00+09:00',all_day:false,location:null};
const message={type:'message',content:'回答',title:null,summary:null,actions:[]};
const proposal={type:'proposal',content:null,title:'Task proposal',summary:'整理します',actions:[{kind:'create_task',target:'task',payload:task}]};
const parses=(action:unknown)=>aiResponseSchema.safeParse({...proposal,actions:[action]}).success;
const payloadKeys=(action:unknown)=>Object.keys((action as {properties:{payload:{properties:Record<string,unknown>}}}).properties.payload.properties).sort();

Deno.test('accepts exact message nullable/required contract',()=>assertEquals(aiResponseSchema.safeParse(message).success,true));
Deno.test('accepts exact proposal nullable/required contract',()=>assertEquals(aiResponseSchema.safeParse(proposal).success,true));
Deno.test('freezes the Human Test create_task contract',()=>assertEquals(parses({kind:'create_task',target:'task',payload:{...task,title:'イベント内容を確認する',status:'todo',due_date:'2026-08-16T12:00:00+09:00'}}),true));
Deno.test('freezes the staging update_task deadline contract',()=>assertEquals(parses({kind:'update_task',target:'11111111-1111-4111-8111-111111111111',payload:{...taskPatch,due_date:'2026-08-17T18:00:00+09:00'}}),true));
Deno.test('provider envelope contains the discriminated response',()=>assertEquals(providerResponseEnvelopeSchema.safeParse({response:message}).success,true));
Deno.test('rejects message fields that only the old broad JSON schema allowed',()=>assertEquals(aiResponseSchema.safeParse({...message,title:'unexpected'}).success,false));
Deno.test('rejects proposal with nullable fields in the wrong branch',()=>assertEquals(aiResponseSchema.safeParse({...proposal,content:'unexpected'}).success,false));
Deno.test('rejects an unknown proposal kind',()=>assertEquals(parses({kind:'delete_everything',target:'all',payload:task}),false));
Deno.test('rejects localized task status before proposal persistence',()=>assertEquals(parses({kind:'create_task',target:'task',payload:{...task,status:'未完了'}}),false));
Deno.test('rejects malformed task dates before proposal persistence',()=>assertEquals(parses({kind:'create_task',target:'task',payload:{...task,due_date:'tomorrow'}}),false));
Deno.test('rejects missing action-specific required fields',()=>{const {assignee_id:_,...missing}=task;assertEquals(parses({kind:'create_task',target:'task',payload:missing}),false)});
Deno.test('accepts every supported action through the canonical action-specific contract',()=>{const actions=[
  {kind:'create_task',target:'task',payload:task},
  {kind:'update_task',target:'11111111-1111-4111-8111-111111111111',payload:taskPatch},
  {kind:'create_goal',target:'goal',payload:goal},
  {kind:'update_goal',target:'22222222-2222-4222-8222-222222222222',payload:goalPatch},
  {kind:'create_event',target:'event',payload:event},
];for(const value of actions)assertEquals(parses(value),true)});
Deno.test('rejects the observed staging create_goal due_date leakage',()=>assertEquals(parses({kind:'create_goal',target:'goal',payload:{...goal,target_date:null,due_date:'2026-09-30T00:00:00Z'}}),false));
Deno.test('accepts create_goal target_date without a due_date field',()=>assertEquals(parses({kind:'create_goal',target:'goal',payload:goal}),true));
Deno.test('rejects cross-action field leakage',()=>{const invalid=[
  {kind:'create_task',target:'task',payload:{...task,target_date:'2026-09-30'}},
  {kind:'create_task',target:'task',payload:{...task,start_at:'2026-08-20T10:00:00Z'}},
  {kind:'create_goal',target:'goal',payload:{...goal,priority:'high'}},
  {kind:'create_event',target:'event',payload:{...event,due_date:'2026-08-20T10:00:00Z'}},
  {kind:'create_event',target:'event',payload:{...event,target_date:'2026-09-30'}},
  {kind:'update_task',target:'11111111-1111-4111-8111-111111111111',payload:{...taskPatch,target_date:'2026-09-30'}},
  {kind:'update_goal',target:'22222222-2222-4222-8222-222222222222',payload:{...goalPatch,due_date:'2026-09-30T00:00:00Z'}},
];for(const value of invalid)assertEquals(parses(value),false)});
Deno.test('rejects unknown payload keys',()=>assertEquals(parses({kind:'create_goal',target:'goal',payload:{...goal,unexpected:true}}),false));
Deno.test('rejects event end before start',()=>assertEquals(parses({kind:'create_event',target:'event',payload:{...event,end_at:'2026-08-20T18:00:00+09:00'}}),false));
Deno.test('JSON Schema mirrors action-specific payload fields',()=>{
  const actions=responseJsonSchema.properties.response.anyOf[1].properties.actions.items.anyOf;
  assertEquals(payloadKeys(actions[0]),['assignee_id','description','due_date','priority','status','title']);
  assertEquals(payloadKeys(actions[2]),['description','status','target_date','title']);
  assertEquals(payloadKeys(actions[4]),['all_day','description','end_at','location','start_at','title']);
  assertEquals(responseJsonSchema.type,'object');assertEquals('anyOf'in responseJsonSchema,false);
});
