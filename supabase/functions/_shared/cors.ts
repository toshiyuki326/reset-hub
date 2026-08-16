const localBrowserOrigins=new Set(['http://127.0.0.1:5173','http://localhost:5173']);

export type AppEnvironment='development'|'staging'|'production';
export const browserCorsAllowHeaders='authorization, apikey, content-type, x-client-info';
export const browserCorsAllowMethods='POST, OPTIONS';

function environment(value:string):AppEnvironment{
  return value==='development'||value==='staging'?value:'production';
}

function configuredOrigins(appUrl:string,appEnv:AppEnvironment){
  const origins=appUrl.split(',').map(value=>value.trim()).filter(Boolean);
  if(appEnv==='production'){
    if(origins.length!==1)return new Set<string>();
    try{const url=new URL(origins[0]);if(url.protocol!=='https:'||url.origin!==origins[0])return new Set<string>()}catch{return new Set<string>()}
  }
  return new Set(origins);
}

export function browserCorsHeaders(request:Request,appUrl=Deno.env.get('APP_URL')||'',appEnvValue=Deno.env.get('APP_ENV')||'production'){
  const origin=request.headers.get('origin')||'';
  const appEnv=environment(appEnvValue);
  const allowed=configuredOrigins(appUrl,appEnv).has(origin)||((appEnv==='development'||appEnv==='staging')&&localBrowserOrigins.has(origin));
  return {
    ...(allowed?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{}),
    'Access-Control-Allow-Headers':browserCorsAllowHeaders,
    'Access-Control-Allow-Methods':browserCorsAllowMethods,
  };
}

export function browserCorsPreflight(request:Request,appUrl=Deno.env.get('APP_URL')||'',appEnvValue=Deno.env.get('APP_ENV')||'production'){
  const headers=browserCorsHeaders(request,appUrl,appEnvValue);
  return new Response(null,{status:'Access-Control-Allow-Origin'in headers?204:403,headers});
}
