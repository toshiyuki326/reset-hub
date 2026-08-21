import {providerResponseEnvelopeSchema,responseJsonSchema,type StructuredAiResponse} from './schema.ts';
import {projectAiSystemInstruction} from './prompt.ts';
export type ProviderErrorCode='RATE_LIMIT'|'PROVIDER_UNAVAILABLE'|'INVALID_STRUCTURED_RESPONSE';
export type ProviderDiagnostic={stage:'model_validation'|'response_shape'|'response_incomplete'|'response_refusal'|'json_parse'|'zod_validation';status?:string;incompleteReason?:string;bodyKeys?:string[];outputTypes?:string[];contentTypes?:string[];issues?:Array<{path:string;code:string;expected?:string}>};
export class ProviderError extends Error{constructor(public code:ProviderErrorCode,public diagnostic?:ProviderDiagnostic){super(code)}}
export type ProviderResult={response:StructuredAiResponse;model:string;inputTokens:number;outputTokens:number};
export const ALLOWED_OPENAI_MODELS=['gpt-4.1-mini'] as const;

export function resolveOpenAiModel(value=Deno.env.get('OPENAI_MODEL')):typeof ALLOWED_OPENAI_MODELS[number]{
  const model=value||'gpt-4.1-mini';
  if(!ALLOWED_OPENAI_MODELS.includes(model as typeof ALLOWED_OPENAI_MODELS[number]))throw new ProviderError('PROVIDER_UNAVAILABLE',{stage:'model_validation'});
  return model as typeof ALLOWED_OPENAI_MODELS[number];
}

const record=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const records=(value:unknown)=>Array.isArray(value)?value.map(record).filter((item):item is Record<string,unknown>=>Boolean(item)):[];
const shape=(body:Record<string,unknown>)=>{const output=records(body.output);const content=output.flatMap(item=>records(item.content));return {bodyKeys:Object.keys(body).sort(),outputTypes:output.map(item=>String(item.type||'unknown')),contentTypes:content.map(item=>String(item.type||'unknown'))}};

export function extractOpenAiOutput(body:Record<string,unknown>){
  const diagnostic=shape(body);const status=typeof body.status==='string'?body.status:undefined;
  if(status==='incomplete'){const details=record(body.incomplete_details);throw new ProviderError('INVALID_STRUCTURED_RESPONSE',{stage:'response_incomplete',status,incompleteReason:typeof details?.reason==='string'?details.reason:'unknown',...diagnostic})}
  const content=records(body.output).flatMap(item=>records(item.content));
  if(content.some(item=>item.type==='refusal'))throw new ProviderError('INVALID_STRUCTURED_RESPONSE',{stage:'response_refusal',status,...diagnostic});
  const text=content.filter(item=>item.type==='output_text'&&typeof item.text==='string').map(item=>item.text as string).join('');
  if(!text)throw new ProviderError('INVALID_STRUCTURED_RESPONSE',{stage:'response_shape',status,...diagnostic});
  let parsed:unknown;try{parsed=JSON.parse(text)}catch{throw new ProviderError('INVALID_STRUCTURED_RESPONSE',{stage:'json_parse',status,...diagnostic})}
  const validated=providerResponseEnvelopeSchema.safeParse(parsed);
  if(!validated.success)throw new ProviderError('INVALID_STRUCTURED_RESPONSE',{stage:'zod_validation',status,...diagnostic,issues:validated.error.issues.slice(0,8).map(issue=>({path:issue.path.join('.'),code:issue.code,...('expected'in issue&&typeof issue.expected==='string'?{expected:issue.expected}:{})}))});
  return validated.data.response;
}

export async function requestOpenAi(input:string,fetcher:typeof fetch=fetch):Promise<ProviderResult>{
  const apiKey=Deno.env.get('OPENAI_API_KEY');if(!apiKey)throw new ProviderError('PROVIDER_UNAVAILABLE');
  const model=resolveOpenAiModel();let response:Response|undefined;
  for(let attempt=0;attempt<2;attempt++){
    try{response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({model,instructions:projectAiSystemInstruction,input,max_output_tokens:1200,text:{format:{type:'json_schema',name:'reset_hub_project_ai_response',strict:true,schema:responseJsonSchema}}})})}catch{response=undefined}
    if(response?.status===429)throw new ProviderError('RATE_LIMIT');
    if(response?.ok)break;
    const retryable=!response||response.status>=500;
    if(!retryable||attempt===1)break;
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!response?.ok)throw new ProviderError('PROVIDER_UNAVAILABLE');
  const body=record(await response.json())||{};const structured=extractOpenAiOutput(body);
  const usage=record(body.usage)||{};return {response:structured,model,inputTokens:Number(usage.input_tokens||0),outputTokens:Number(usage.output_tokens||0)};
}
