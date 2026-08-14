import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {requestSchema, type SafeErrorCode} from './schema.ts';
import {ExecutorError, executeApprovedProposal} from './executor.ts';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_URL') || '',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Content-Type': 'application/json',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: cors});
// Never return raw Postgres/JS error text to the browser: only a fixed safe code and
// a generic message, mirroring project-ai-chat's error contract.
const failure = (code: SafeErrorCode, status: number) =>
  reply({error: 'PROPOSAL_EXECUTION_FAILED', code, message: '提案を実行できませんでした。'}, status);

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers: cors});
  if (req.method !== 'POST') return failure('INVALID_REQUEST', 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: {persistSession: false},
  });

  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
    if (!jwt) return failure('AUTHENTICATION_ERROR', 401);
    const {
      data: {user},
      error: userError,
    } = await admin.auth.getUser(jwt);
    if (userError || !user) return failure('AUTHENTICATION_ERROR', 401);

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return failure('INVALID_REQUEST', 400);

    const {data: profile} = await admin.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (!profile) return failure('PERMISSION_DENIED', 403);

    const message = await executeApprovedProposal(admin, {messageId: parsed.data.message_id, profileId: profile.id});
    return reply({message});
  } catch (error) {
    if (error instanceof ExecutorError) {
      console.error('execute-ai-proposal rejected', {code: error.code});
      return failure(error.code, error.status);
    }
    console.error('execute-ai-proposal failed', error);
    return failure('EXECUTION_FAILED', 502);
  }
});
