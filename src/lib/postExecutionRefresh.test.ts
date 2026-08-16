import {describe,expect,it} from 'vitest';
import type {ConversationMessage} from '../repositories/aiConversationRepository';
import {affectedEntitiesForMessage} from '../components/ai/postExecutionRefresh';

const message=(kinds:string[]):ConversationMessage=>({id:'m',communityId:'c',sessionId:'s',role:'assistant',content:'proposal',proposal:{actions:kinds.map(kind=>({kind,target:'target',payload:{}}))},proposalStatus:'approved',createdAt:'2026-08-16T00:00:00Z'});

describe('post-execution refresh mapping',()=>{
  it.each([
    ['create_task','tasks'],['update_task','tasks'],['create_goal','goals'],['update_goal','goals'],['create_event','events']
  ] as const)('%s refreshes only %s',(kind,entity)=>expect(affectedEntitiesForMessage(message([kind]))).toEqual([entity]));
  it('deduplicates slices for multi-action proposals',()=>expect(affectedEntitiesForMessage(message(['create_task','update_task','create_event']))).toEqual(['tasks','events']));
  it('does not infer a refresh for malformed or unknown actions',()=>expect(affectedEntitiesForMessage(message(['unknown']))).toEqual([]));
});
