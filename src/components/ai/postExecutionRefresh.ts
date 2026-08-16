import type {ConversationMessage} from '../../repositories/aiConversationRepository';

export type ExecutableActionKind='create_task'|'update_task'|'create_goal'|'update_goal'|'create_event';
export type RefreshEntity='tasks'|'goals'|'events';

const refreshEntityByAction:Record<ExecutableActionKind,RefreshEntity>={create_task:'tasks',update_task:'tasks',create_goal:'goals',update_goal:'goals',create_event:'events'};

export function affectedEntitiesForMessage(message:ConversationMessage|undefined):RefreshEntity[]{
  if(!message?.proposal||typeof message.proposal!=='object'||Array.isArray(message.proposal))return [];
  const actions=(message.proposal as Record<string,unknown>).actions;
  if(!Array.isArray(actions))return [];
  const entities=new Set<RefreshEntity>();
  for(const action of actions){
    if(!action||typeof action!=='object'||Array.isArray(action))continue;
    const kind=(action as Record<string,unknown>).kind;
    if(typeof kind==='string'&&kind in refreshEntityByAction)entities.add(refreshEntityByAction[kind as ExecutableActionKind]);
  }
  return [...entities];
}
