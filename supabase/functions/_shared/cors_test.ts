import {assertEquals} from 'jsr:@std/assert';
import {browserCorsAllowHeaders,browserCorsAllowMethods,browserCorsPreflight} from './cors.ts';

const preflight=(origin:string)=>new Request('https://functions.example/project-ai-chat',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type,x-client-info'}});
const origin=(response:Response)=>response.headers.get('Access-Control-Allow-Origin');

Deno.test('development allows both explicit local browser origins',()=>{
  for(const value of ['http://localhost:5173','http://127.0.0.1:5173']){
    const response=browserCorsPreflight(preflight(value),'','development');
    assertEquals(response.status,204);assertEquals(origin(response),value);
  }
});

Deno.test('staging allows its APP_URL and local Real Browser Test origins only',()=>{
  for(const value of ['https://staging.example.com','http://localhost:5173','http://127.0.0.1:5173']){
    const response=browserCorsPreflight(preflight(value),'https://staging.example.com','staging');
    assertEquals(response.status,204);assertEquals(origin(response),value);
    assertEquals(response.headers.get('Access-Control-Allow-Headers'),browserCorsAllowHeaders);
    assertEquals(response.headers.get('Access-Control-Allow-Methods'),browserCorsAllowMethods);
    assertEquals(response.headers.get('Vary'),'Origin');
  }
  const rejected=browserCorsPreflight(preflight('https://unknown.invalid'),'https://staging.example.com','staging');
  assertEquals(rejected.status,403);assertEquals(origin(rejected),null);
});

Deno.test('production allows exactly one HTTPS APP_URL and rejects all other origins',()=>{
  const appUrl='https://app.example.com';
  const allowed=browserCorsPreflight(preflight(appUrl),appUrl,'production');
  assertEquals(allowed.status,204);assertEquals(origin(allowed),appUrl);
  for(const value of ['http://localhost:5173','http://127.0.0.1:5173','https://staging.example.com','https://unknown.invalid']){
    const response=browserCorsPreflight(preflight(value),appUrl,'production');
    assertEquals(response.status,403);assertEquals(origin(response),null);
  }
});

Deno.test('production fails closed for missing, invalid, or multi-origin configuration',()=>{
  const request=preflight('https://app.example.com');
  for(const appUrl of ['','http://app.example.com','https://app.example.com/','https://app.example.com,https://other.example.com']){
    assertEquals(browserCorsPreflight(request,appUrl,'production').status,403);
  }
  assertEquals(browserCorsPreflight(preflight('http://127.0.0.1:5173'),'','unknown').status,403);
});
