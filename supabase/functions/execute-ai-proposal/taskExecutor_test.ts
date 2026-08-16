import {assertEquals} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {validateExecutableActions} from './taskExecutor.ts';

const task={title:'準備',description:null,status:null,priority:null,due_date:null,assignee_id:null};
const taskPatch={...task,title:null};
const goal={title:'Goal',description:null,status:'active',target_date:'2026-09-30'};
const goalPatch={title:null,description:null,status:null,target_date:null};
const event={title:'Event',description:null,start_at:'2026-08-20T19:00:00+09:00',end_at:'2026-08-20T20:00:00+09:00',all_day:false,location:null};
const validate=(action:unknown)=>validateExecutableActions({actions:[action]});

Deno.test('accepts the create_task and staging update_task contracts',()=>{
  assertEquals(validate({kind:'create_task',target:'task',payload:task}),null);
  assertEquals(validate({kind:'update_task',target:'11111111-1111-4111-8111-111111111111',payload:{...taskPatch,due_date:'2026-08-17T18:00:00+09:00'}}),null);
});
Deno.test('accepts canonical create_goal, update_goal, and create_event contracts',()=>{
  assertEquals(validate({kind:'create_goal',target:'goal',payload:goal}),null);
  assertEquals(validate({kind:'update_goal',target:'11111111-1111-4111-8111-111111111111',payload:goalPatch}),null);
  assertEquals(validate({kind:'create_event',target:'event',payload:event}),null);
});
Deno.test('rejects observed create_goal due_date leakage at action_schema stage',()=>{
  const result=validate({kind:'create_goal',target:'goal',payload:{...goal,target_date:null,due_date:'2026-09-30T00:00:00Z'}});
  assertEquals(result?.code,'INVALID_ACTION');assertEquals(result?.diagnostic.stage,'action_schema');
  assertEquals(result?.diagnostic.actionKind,'create_goal');assertEquals(result?.diagnostic.payloadKeys?.includes('due_date'),true);
});
Deno.test('rejects cross-action leakage for every action family',()=>{const values=[
  {kind:'create_task',target:'task',payload:{...task,target_date:'2026-09-30'}},
  {kind:'create_task',target:'task',payload:{...task,start_at:'2026-08-20T10:00:00Z'}},
  {kind:'create_goal',target:'goal',payload:{...goal,priority:'high'}},
  {kind:'create_event',target:'event',payload:{...event,due_date:'2026-08-20T10:00:00Z'}},
  {kind:'create_event',target:'event',payload:{...event,target_date:'2026-09-30'}},
  {kind:'update_task',target:'11111111-1111-4111-8111-111111111111',payload:{...taskPatch,target_date:'2026-09-30'}},
  {kind:'update_goal',target:'11111111-1111-4111-8111-111111111111',payload:{...goalPatch,due_date:'2026-09-30T00:00:00Z'}},
];for(const value of values)assertEquals(validate(value)?.code,'INVALID_ACTION')});
Deno.test('rejects localized status with a safe diagnostic',()=>{const result=validate({kind:'create_task',target:'task',payload:{...task,status:'未完了'}});assertEquals(result?.code,'INVALID_ACTION');assertEquals(result?.diagnostic.stage,'action_schema')});
Deno.test('rejects unsupported action kind before canonical validation',()=>{const result=validate({kind:'delete_everything',target:'all',payload:{}});assertEquals(result?.code,'UNSUPPORTED_ACTION');assertEquals(result?.diagnostic.stage,'action_kind')});
Deno.test('rejects mixed supported and unsupported kinds without partial execution',()=>assertEquals(validateExecutableActions({actions:[{kind:'create_task',target:'task',payload:task},{kind:'delete_everything',target:'all',payload:{}}]})?.code,'UNSUPPORTED_ACTION'));
Deno.test('rejects missing required fields and unknown keys',()=>{
  const {assignee_id:_,...missing}=task;assertEquals(validate({kind:'create_task',target:'task',payload:missing})?.code,'INVALID_ACTION');
  assertEquals(validate({kind:'create_goal',target:'goal',payload:{...goal,unexpected:true}})?.code,'INVALID_ACTION');
});
Deno.test('rejects malformed proposal, empty actions, and malformed action',()=>{
  assertEquals(validateExecutableActions(null)?.code,'INVALID_ACTION');assertEquals(validateExecutableActions({})?.code,'INVALID_ACTION');
  assertEquals(validateExecutableActions({actions:[]})?.code,'INVALID_ACTION');assertEquals(validateExecutableActions({actions:[null]})?.code,'INVALID_ACTION');
});
Deno.test('rejects invalid date, target, and event ordering',()=>{
  assertEquals(validate({kind:'create_task',target:'task',payload:{...task,due_date:'tomorrow'}})?.code,'INVALID_ACTION');
  assertEquals(validate({kind:'create_task',target:'another-community',payload:task})?.code,'INVALID_ACTION');
  assertEquals(validate({kind:'create_event',target:'event',payload:{...event,end_at:'2026-08-20T18:00:00+09:00'}})?.code,'INVALID_ACTION');
});
