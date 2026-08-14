import type {DocumentContract,TaskContract} from './contracts';import type {Role} from './index';
export interface ContextUser{id:string;displayName:string;role:Role}
export interface ProjectGoal{id:string;communityId:string;title:string;description:string;status:'draft'|'active'|'completed'|'cancelled';targetDate?:string}
export interface ProjectKpi{id:string;goalId:string;name:string;unit:string;targetValue?:number;entries:Array<{value:number;recordedAt:string;note:string}>}
export interface ConversationContextMessage{role:'user'|'assistant';content:string;createdAt:string}
export interface ContextBuilderInput{currentUser:ContextUser;community:{id:string;name:string;slug:string};project?:{id:string;title:string};goals:ProjectGoal[];kpis:ProjectKpi[];tasks:TaskContract[];documents:DocumentContract[];conversationHistory:ConversationContextMessage[];relevantActivity:Array<{action:string;entityType:string;createdAt:string;metadata:Record<string,unknown>}>}
export interface BuiltContext{version:1;generatedAt:string;identity:ContextBuilderInput['currentUser'];community:ContextBuilderInput['community'];project?:ContextBuilderInput['project'];goals:ProjectGoal[];kpis:ProjectKpi[];openTasks:TaskContract[];documents:DocumentContract[];conversationHistory:ConversationContextMessage[];relevantActivity:ContextBuilderInput['relevantActivity']}
