export type SingleFlight=(key:string,operation:()=>Promise<void>)=>Promise<void>;
export function createSingleFlight():SingleFlight{const active=new Set<string>();return async(key,operation)=>{if(active.has(key))return;active.add(key);try{await operation()}finally{active.delete(key)}}}
