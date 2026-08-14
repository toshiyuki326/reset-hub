import {createClient} from '@supabase/supabase-js';

const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined;
export const fixtureMode=import.meta.env.VITE_USE_FIXTURES==='true';
if(!fixtureMode&&(!url||!key))throw new Error('Supabase configuration is required. Set VITE_USE_FIXTURES=true only for explicit local fixture mode.');
export const supabase=fixtureMode?null:createClient(url!,key!,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
