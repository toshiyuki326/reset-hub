import {describe,expect,it} from 'vitest';import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../../supabase/migrations/202608130006_ai_proposal_execution_foundation.sql',import.meta.url),'utf8');
const rcMigration=readFileSync(new URL('../../supabase/migrations/202608150008_rc_executor_expansion_and_hardening.sql',import.meta.url),'utf8');
const read=(name:string)=>readFileSync(new URL(`../../supabase/functions/execute-ai-proposal/${name}`,import.meta.url),'utf8');
const index=read('index.ts');const executor=read('executor.ts');const schema=read('schema.ts');const taskExecutor=read('taskExecutor.ts');const actionContract=readFileSync(new URL('../../supabase/functions/_shared/actionContract.ts',import.meta.url),'utf8');
const service=readFileSync(new URL('../services/projectAiService.ts',import.meta.url),'utf8');
const controller=readFileSync(new URL('../components/ai/projectAiController.ts',import.meta.url),'utf8');

describe('migration 202608130006: execution state', () => {
  it('adds the executing state in its own transaction ahead of everything that uses it', () => {
    const addValueIndex = migration.indexOf("add value if not exists 'executing'");
    const commitIndex = migration.indexOf('commit;');
    expect(addValueIndex).toBeGreaterThan(-1);
    expect(commitIndex).toBeGreaterThan(addValueIndex);
  });
  it('requires an idempotency key once executing/executed', () => {
    expect(migration).toContain("check(proposal_status not in ('executing','executed') or execution_id is not null)");
  });
});

describe('migration 202608130006: proposal immutability (★ requirement B)', () => {
  it('blocks changing the proposal payload once it has left proposal/review, via a trigger not an API gap', () => {
    expect(migration).toContain('before update on public.ai_conversation_messages');
    expect(migration).toContain("old.proposal_status not in ('proposal','review')");
    expect(migration).toContain('new.proposal is distinct from old.proposal');
    expect(migration).toContain('raise exception');
  });
});

describe('migration 202608130006: atomic claim (★ requirement A)', () => {
  it('performs the claim update and the task-mutation loop inside one function body (one transaction)', () => {
    const fn = migration.slice(migration.indexOf('create or replace function public.execute_ai_proposal'), migration.indexOf('create or replace function public.mark_ai_proposal_failed'));
    expect(fn).toContain("set proposal_status='executing'");
    expect(fn).toContain("insert into public.tasks");
    expect(fn).toContain("update public.tasks set");
    expect(fn).toContain("set proposal_status='executed'");
    // A single plpgsql function body has no explicit BEGIN/COMMIT of its own — the whole
    // call is already one Postgres transaction, so any exception rolls everything back.
    expect(fn).not.toMatch(/^\s*commit;/m);
  });
  it('is only callable by the service role, never directly by the browser', () => {
    expect(migration).toContain('revoke all on function public.execute_ai_proposal(uuid,uuid) from public,anon,authenticated');
    expect(migration).toContain('grant execute on function public.execute_ai_proposal(uuid,uuid) to service_role');
    expect(migration).toContain('revoke all on function public.mark_ai_proposal_failed(uuid,uuid,text) from public,anon,authenticated');
    expect(migration).toContain('grant execute on function public.mark_ai_proposal_failed(uuid,uuid,text) to service_role');
  });
  it('rejects unknown action kinds and empty action lists before claiming', () => {
    const fn = migration.slice(migration.indexOf('create or replace function public.execute_ai_proposal'), migration.indexOf('create or replace function public.mark_ai_proposal_failed'));
    const beforeClaim = fn.slice(0, fn.indexOf("set proposal_status='executing'"));
    expect(beforeClaim).toContain("not in ('create_task','update_task')");
    expect(beforeClaim).toContain('jsonb_array_length(v_actions)=0');
  });
  it('re-verifies session ownership, active membership and role-based task permission inside the function (RLS is bypassed by SECURITY DEFINER)', () => {
    expect(migration).toContain('v_session.profile_id<>p_profile_id');
    expect(migration).toContain('coalesce(v_active,false) is not true');
    expect(migration).toContain("v_role in ('owner','admin')");
  });
  it('rejects cross-community task updates', () => {
    expect(migration).toContain('v_task.community_id<>v_message.community_id');
  });
  it('never lets the caller set community_id/created_by on the created task', () => {
    const createStatement = migration.slice(migration.indexOf('insert into public.tasks(community_id'), migration.indexOf('returning id into v_new_task_id'));
    expect(createStatement).toContain('v_message.community_id');
    expect(createStatement).toContain('v_message.approved_by');
    expect(createStatement).not.toMatch(/v_payload->>'community_id'/);
    expect(createStatement).not.toMatch(/v_payload->>'created_by'/);
  });
  it('never lets update_task change the task id or its community', () => {
    const updateStatement = migration.slice(migration.indexOf('update public.tasks set\n        title'), migration.indexOf('where id=v_task.id;\n\n      v_after_snapshot'));
    expect(updateStatement).not.toMatch(/community_id\s*=/);
    expect(updateStatement).not.toMatch(/\bid\s*=\s*v_payload/);
  });
});

describe('migration 202608130006: execution audit', () => {
  it('creates a dedicated audit table with the required fields', () => {
    expect(migration).toContain('create table public.ai_proposal_executions');
    for (const column of ['execution_id', 'community_id', 'message_id', 'executor_profile_id', 'approved_by', 'action_kinds', 'status', 'safe_error_code', 'started_at', 'completed_at', 'before_snapshot', 'after_snapshot']) {
      expect(migration).toContain(column);
    }
  });
  it('prevents two concurrently-executing audit rows for the same proposal at the database level', () => {
    expect(migration).toContain("create unique index ai_proposal_executions_active_idx on public.ai_proposal_executions(message_id) where status='executing'");
  });
  it('is readable only within your own community and never writable by the browser', () => {
    expect(migration).toContain('create policy ai_proposal_executions_read on public.ai_proposal_executions for select using(public.is_active_member(community_id))');
    expect(migration).toContain('revoke all on public.ai_proposal_executions from authenticated,anon');
    expect(migration).not.toMatch(/create policy .*ai_proposal_executions.* for (insert|update|delete)/);
  });
});

describe('execute-ai-proposal Edge Function', () => {
  it('requires a JWT and never trusts a client-supplied community/profile/action payload', () => {
    expect(index).toContain('admin.auth.getUser(jwt)');
    expect(schema).toContain("z.object({message_id: z.string().uuid()}).strict()");
    expect(index).not.toMatch(/community_id\s*:\s*parsed/);
  });
  it('re-verifies session ownership and active membership before ever calling the RPC', () => {
    expect(executor).toContain("session.profile_id !== input.profileId");
    expect(executor).toContain('membership?.active');
  });
  it('never returns raw Postgres error text to the browser', () => {
    expect(index).toContain("message: '提案を実行できませんでした。'");
    expect(index).not.toMatch(/error\.message/);
    expect(index).not.toMatch(/error\.detail/);
  });
  it('maps every custom SQLSTATE to one safe error code, with a generic fallback', () => {
    for (const code of ['NOT_APPROVED', 'ALREADY_EXECUTING', 'ALREADY_EXECUTED', 'UNSUPPORTED_ACTION', 'INVALID_ACTION', 'TARGET_NOT_FOUND', 'COMMUNITY_MISMATCH', 'PERMISSION_DENIED', 'INACTIVE_MEMBER', 'EXECUTION_FAILED']) {
      expect(schema).toContain(`'${code}'`);
    }
    expect(executor).toContain("|| 'EXECUTION_FAILED'");
  });
  it('records a terminal failure only for errors that mean a claim was actually made', () => {
    expect(executor).toContain("NOT_APPROVED', 'ALREADY_EXECUTING', 'ALREADY_EXECUTED', 'INACTIVE_MEMBER'");
    expect(executor).toContain("mark_ai_proposal_failed");
  });
  it('validates the actions allowlist client-side before spending a claim attempt', () => {
    expect(taskExecutor).toContain("../_shared/actionContract.ts");
    for (const kind of ['create_task','update_task','create_goal','update_goal','create_event']) expect(actionContract).toContain(`'${kind}'`);
  });
});

describe('RC executor expansion and grants',()=>{
  it('uses a fixed five-action allowlist with no dynamic SQL',()=>{expect(rcMigration).toContain("not in ('create_task','update_task','create_goal','update_goal','create_event')");expect(rcMigration).not.toMatch(/\bexecute\s+format\s*\(/i)});
  it('keeps goal/event writes in the same atomic executor transaction',()=>{expect(rcMigration).toContain('insert into public.project_goals');expect(rcMigration).toContain('update public.project_goals set');expect(rcMigration).toContain('insert into public.events');expect(rcMigration).toContain("set proposal_status='executed'")});
  it('keeps message update and executor RPC unavailable to authenticated',()=>{expect(rcMigration).toContain('grant select, insert on table public.ai_conversation_messages to authenticated');expect(rcMigration).toContain('revoke all on function public.execute_ai_proposal(uuid,uuid) from public, anon, authenticated')});
  it('rate limits through an atomic service-only RPC',()=>{expect(rcMigration).toContain('create table public.ai_rate_limit_windows');expect(rcMigration).toContain('if v_count>10');expect(rcMigration).toContain('if v_count>50');expect(rcMigration).toContain('grant execute on function public.claim_project_ai_request(uuid,uuid) to service_role')});
});

describe('browser integration', () => {
  it('only ever sends message_id to the executor, never task/community/profile fields', () => {
    expect(service).toMatch(/functions\.invoke\('execute-ai-proposal',\s*\{body:\{message_id:messageId\}\}\)/);
  });
  it('execution is gated on explicit approval, distinct from review', () => {
    expect(controller).toContain("isProposalExecutable=(message:ConversationMessage)=>message.proposalStatus==='approved'");
  });
});
