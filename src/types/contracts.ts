import type {Priority,Status} from './index';
export type EntitySource={type:'manual'|'line'|'event';id?:string};
export interface TaskContract{id:string;communityId:string;title:string;description:string;status:Status;priority:Priority;assigneeId?:string;dueAt?:string;eventId?:string;source:EntitySource;createdBy:string;createdAt:string;updatedAt:string;completedAt?:string}
export type DocumentKind='note'|'brief'|'reference';
export interface DocumentContract{id:string;communityId:string;title:string;body:string;kind:DocumentKind;createdBy:string;createdAt:string;updatedAt:string;source?:EntitySource;tags:string[]}
export const isTaskContract=(x:unknown):x is TaskContract=>{const v=x as TaskContract;return Boolean(v&&v.id&&v.communityId&&v.title&&v.source&&v.createdAt&&v.updatedAt)};
export const isDocumentContract=(x:unknown):x is DocumentContract=>{const v=x as DocumentContract;return Boolean(v&&v.id&&v.communityId&&v.title&&typeof v.body==='string'&&Array.isArray(v.tags))};
