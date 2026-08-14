import {buildContext} from './contextBuilder';import type {BuiltContext,ContextBuilderInput} from '../types/contextBuilderTypes';
export interface ContextBuilderService{build:(input:ContextBuilderInput,generatedAt?:string)=>BuiltContext}
export const contextBuilderService:ContextBuilderService={build:(input,generatedAt=new Date().toISOString())=>buildContext(input,generatedAt)};
