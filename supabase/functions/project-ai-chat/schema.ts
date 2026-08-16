import {z} from 'npm:zod@4.0.17';
import {proposalActionJsonSchema,proposalActionSchema} from '../_shared/actionContract.ts';
export {allowedProposalKinds,createEventPayloadSchema,createGoalPayloadSchema,createTaskPayloadSchema,proposalActionSchema,updateGoalPayloadSchema,updateTaskPayloadSchema} from '../_shared/actionContract.ts';

const messageResponse=z.object({type:z.literal('message'),content:z.string().min(1),title:z.null(),summary:z.null(),actions:z.array(proposalActionSchema).length(0)}).strict();
const proposalResponse=z.object({type:z.literal('proposal'),content:z.null(),title:z.string().min(1),summary:z.string().min(1),actions:z.array(proposalActionSchema).min(1).max(10)}).strict();
export const aiResponseSchema=z.discriminatedUnion('type',[messageResponse,proposalResponse]);
export const providerResponseEnvelopeSchema=z.object({response:aiResponseSchema}).strict();
export type StructuredAiResponse=z.infer<typeof aiResponseSchema>;

const messageJsonSchema={type:'object',additionalProperties:false,required:['type','content','title','summary','actions'],properties:{type:{type:'string',enum:['message']},content:{type:'string',minLength:1},title:{type:'null'},summary:{type:'null'},actions:{type:'array',maxItems:0,items:proposalActionJsonSchema}}} as const;
const proposalJsonSchema={type:'object',additionalProperties:false,required:['type','content','title','summary','actions'],properties:{type:{type:'string',enum:['proposal']},content:{type:'null'},title:{type:'string',minLength:1},summary:{type:'string',minLength:1},actions:{type:'array',minItems:1,maxItems:10,items:proposalActionJsonSchema}}} as const;

// Structured Outputs forbids a root-level anyOf. Keep the root an object and
// place the exact message/proposal discriminated union one level below it.
export const responseJsonSchema={type:'object',additionalProperties:false,required:['response'],properties:{response:{anyOf:[messageJsonSchema,proposalJsonSchema]}}} as const;
