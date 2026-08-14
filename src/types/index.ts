export type Role='owner'|'admin'|'member';
export type Status='todo'|'in_progress'|'waiting'|'done'|'cancelled';
export type Priority='low'|'medium'|'high'|'urgent';
export interface Member{id:string;displayName:string;email:string;role:Role;active:boolean;avatar:string}
export interface Task{id:string;title:string;description:string;status:Status;priority:Priority;assigneeId?:string;dueDate?:string;eventId?:string;sourceType:'manual'|'line'|'event';sourceId?:string;createdAt:string;completedAt?:string}
export interface Event{id:string;title:string;description:string;location:string;startAt:string;endAt:string;allDay:boolean;members:string[];sourceType?:'manual'|'line';sourceId?:string;googleCalendarEventId?:string;googleSyncStatus:'not_synced'|'pending'|'synced'|'error'}
export interface LineMessage{id:string;group:string;sender:string;text:string;receivedAt:string;status:'unprocessed'|'task_created'|'event_created'|'memo'|'archived'}
