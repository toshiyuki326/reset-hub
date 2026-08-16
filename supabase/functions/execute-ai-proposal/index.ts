import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {requestSchema, type SafeErrorCode} from './schema.ts';
import {ExecutorError, executeApprovedProposal} from './executor.ts';
import {browserCorsHeaders, browserCorsPreflight} from '../_shared/cors.ts';

const reply = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {...browserCorsHeaders(req), 'Content-Type': 'application/json'}});
// Never return raw Postgres/JS error text to the browser: only a fixed safe code and
// a generic message, mirroring project-ai-chat's error contract.
const failure = (code: SafeErrorCode, status: number) =>
  (req: Request) => reply(req, {error: 'PROPOSAL_EXECUTION_FAILED', code, message: '提案を実行できませんでした。'}, status);

Deno.serve(async req => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (req.method === 'OPTIONS') return browserCorsPreflight(req);
  if (req.method !== 'POST') return failure('INVALID_REQUEST', 405)(req);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: {persistSession: false},
  });

  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/, '');
    if (!jwt) return failure('AUTHENTICATION_ERROR', 401)(req);
    const {
      data: {user},
      error: userError,
    } = await admin.auth.getUser(jwt);
    if (userError || !user) return failure('AUTHENTICATION_ERROR', 401)(req);

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return failure('INVALID_REQUEST', 400)(req);

    const {data: profile} = await admin.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (!profile) return failure('PERMISSION_DENIED', 403)(req);

    const message = await executeApprovedProposal(admin, {messageId: parsed.data.message_id, profileId: profile.id});
    console.info('execute-ai-proposal completed', {requestId, durationMs: Date.now() - startedAt});
    return reply(req, {message});
  } catch (error) {
    if (error instanceof ExecutorError) {
      console.error('execute-ai-proposal rejected', {requestId, code: error.code, durationMs: Date.now() - startedAt, ...(error.diagnostic ? {diagnostic: error.diagnostic} : {})});
      return failure(error.code, error.status)(req);
    }
    console.error('execute-ai-proposal failed', {requestId, code: 'EXECUTION_FAILED', durationMs: Date.now() - startedAt});
    return failure('EXECUTION_FAILED', 502)(req);
  }
});
