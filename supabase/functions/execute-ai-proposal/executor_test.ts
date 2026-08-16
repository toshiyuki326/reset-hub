import {assertEquals, assertRejects} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {ExecutorError, executeApprovedProposal} from './executor.ts';

type Row = Record<string, unknown>;
type RpcResult = {data: unknown; error: {code?: string} | null};

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  constructor(private rows: Row[]) {}
  select(_columns?: string) {
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push(row => row[key] === value);
    return this;
  }
  async maybeSingle() {
    const match = this.rows.find(row => this.filters.every(f => f(row)));
    return {data: match ?? null, error: null};
  }
}

class FakeClient {
  public rpcCalls: Array<{name: string; args: Record<string, unknown>}> = [];
  constructor(
    private tables: Record<string, Row[]>,
    private rpcHandler: (name: string, args: Record<string, unknown>) => Promise<RpcResult>,
  ) {}
  from(table: string) {
    return new FakeQuery(this.tables[table] ?? []);
  }
  async rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({name, args});
    return this.rpcHandler(name, args);
  }
}

const asClient = (client: FakeClient) => client as unknown as SupabaseClient;

const baseTables = (overrides: Partial<Record<string, Row[]>> = {}) => ({
  ai_conversation_messages: [
    {
      id: 'msg-1',
      community_id: 'community-1',
      session_id: 'session-1',
      proposal: {actions: [{kind: 'create_task', target: 'task', payload: {title: '準備', description: null, status: null, priority: null, assignee_id: null, due_date: null}}]},
      proposal_status: 'approved',
    },
  ],
  ai_conversation_sessions: [{id: 'session-1', profile_id: 'profile-1', community_id: 'community-1'}],
  community_members: [{community_id: 'community-1', profile_id: 'profile-1', active: true}],
  ...overrides,
});

const neverCalled = async (): Promise<RpcResult> => {
  throw new Error('rpc should not have been called');
};

Deno.test('rejects execution when the message does not exist', async () => {
  const client = new FakeClient(baseTables({ai_conversation_messages: []}), neverCalled);
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'missing', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'PERMISSION_DENIED');
  assertEquals(client.rpcCalls.length, 0);
});

Deno.test('rejects execution for a session the caller does not own (other session)', async () => {
  const client = new FakeClient(baseTables(), neverCalled);
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'someone-else'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'PERMISSION_DENIED');
  assertEquals(client.rpcCalls.length, 0);
});

Deno.test('rejects execution for an inactive member', async () => {
  const client = new FakeClient(baseTables({community_members: [{community_id: 'community-1', profile_id: 'profile-1', active: false}]}), neverCalled);
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'INACTIVE_MEMBER');
  assertEquals(client.rpcCalls.length, 0);
});

for (const status of ['proposal', 'review', 'rejected', 'none']) {
  Deno.test(`rejects execution when proposal_status is '${status}'`, async () => {
    const tables = baseTables();
    (tables.ai_conversation_messages[0] as Row).proposal_status = status;
    const client = new FakeClient(tables, neverCalled);
    const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
    assertEquals((error as ExecutorError).code, 'NOT_APPROVED');
    assertEquals(client.rpcCalls.length, 0);
  });
}

Deno.test('rejects a proposal already executing without calling the RPC', async () => {
  const tables = baseTables();
  (tables.ai_conversation_messages[0] as Row).proposal_status = 'executing';
  const client = new FakeClient(tables, neverCalled);
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'ALREADY_EXECUTING');
  assertEquals(client.rpcCalls.length, 0);
});

Deno.test('rejects a proposal already executed without calling the RPC', async () => {
  const tables = baseTables();
  (tables.ai_conversation_messages[0] as Row).proposal_status = 'executed';
  const client = new FakeClient(tables, neverCalled);
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'ALREADY_EXECUTED');
  assertEquals(client.rpcCalls.length, 0);
});

Deno.test('rejects an unsupported action kind before calling the RPC', async () => {
  const tables = baseTables();
  const goalPayload = {title: null, description: null, status: null, priority: null, assignee_id: null, due_date: null};
  (tables.ai_conversation_messages[0] as Row).proposal = {actions: [{kind: 'delete_everything', target: 'all', payload: goalPayload}]};
  const client = new FakeClient(tables, neverCalled);
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'UNSUPPORTED_ACTION');
  assertEquals(client.rpcCalls.length, 0);
});

Deno.test('surfaces only safe validation diagnostics before calling the RPC', async () => {
  const tables = baseTables();
  (tables.ai_conversation_messages[0] as Row).proposal = {actions: [{kind: 'create_task', target: 'task', payload: {
    title: 'Synthetic task', description: null, status: '未完了', priority: null, assignee_id: null,
    due_date: '2026-08-16T12:00:00Z',
  }}]};
  const client = new FakeClient(tables, neverCalled);
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'INVALID_ACTION');
  assertEquals((error as ExecutorError).diagnostic?.stage, 'action_schema');
  assertEquals(JSON.stringify((error as ExecutorError).diagnostic).includes('Synthetic task'), false);
  assertEquals(client.rpcCalls.length, 0);
});

Deno.test('calls execute_ai_proposal with only messageId/profileId and returns its result on success', async () => {
  const client = new FakeClient(baseTables(), async (name, args) => {
    assertEquals(name, 'execute_ai_proposal');
    assertEquals(args, {p_message_id: 'msg-1', p_profile_id: 'profile-1'});
    return {data: {id: 'msg-1', proposal_status: 'executed'}, error: null};
  });
  const result = await executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'});
  assertEquals(result, {id: 'msg-1', proposal_status: 'executed'});
  assertEquals(client.rpcCalls.length, 1);
});

Deno.test('a claim race (RPC reports ALREADY_EXECUTING) is surfaced without marking the proposal failed', async () => {
  const client = new FakeClient(baseTables(), async name => {
    if (name === 'execute_ai_proposal') return {data: null, error: {code: 'AI002'}};
    throw new Error(`unexpected rpc ${name}`);
  });
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'ALREADY_EXECUTING');
  assertEquals(client.rpcCalls.map(c => c.name), ['execute_ai_proposal']);
});

Deno.test('a target-not-found RPC failure is classified and recorded as a terminal failure', async () => {
  const client = new FakeClient(baseTables(), async name => {
    if (name === 'execute_ai_proposal') return {data: null, error: {code: 'AI006'}};
    if (name === 'mark_ai_proposal_failed') return {data: null, error: null};
    throw new Error(`unexpected rpc ${name}`);
  });
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'TARGET_NOT_FOUND');
  assertEquals(client.rpcCalls.map(c => c.name), ['execute_ai_proposal', 'mark_ai_proposal_failed']);
  assertEquals(client.rpcCalls[1].args, {p_message_id: 'msg-1', p_profile_id: 'profile-1', p_error_code: 'TARGET_NOT_FOUND'});
});

Deno.test('an unrecognized RPC error falls back to EXECUTION_FAILED and is still recorded', async () => {
  const client = new FakeClient(baseTables(), async name => {
    if (name === 'execute_ai_proposal') return {data: null, error: {code: '23505'}};
    if (name === 'mark_ai_proposal_failed') return {data: null, error: null};
    throw new Error(`unexpected rpc ${name}`);
  });
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'EXECUTION_FAILED');
  assertEquals(client.rpcCalls[1]?.args, {p_message_id: 'msg-1', p_profile_id: 'profile-1', p_error_code: 'EXECUTION_FAILED'});
});

Deno.test('a network failure cannot trigger a second write path or direct fallback mutation', async () => {
  const tables = baseTables();
  const client = new FakeClient(tables, async name => {
    if (name === 'execute_ai_proposal') throw new Error('network disconnected');
    throw new Error(`unexpected rpc ${name}`);
  });
  await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), Error, 'network disconnected');
  assertEquals(client.rpcCalls.map(call => call.name), ['execute_ai_proposal']);
  assertEquals((tables.ai_conversation_messages[0] as Row).proposal_status, 'approved');
});

Deno.test('the original error is returned to the caller even if the secondary failure-marking call itself fails', async () => {
  const client = new FakeClient(baseTables(), async name => {
    if (name === 'execute_ai_proposal') return {data: null, error: {code: 'AI007'}};
    if (name === 'mark_ai_proposal_failed') return {data: null, error: {code: 'AI008'}};
    throw new Error(`unexpected rpc ${name}`);
  });
  const error = await assertRejects(() => executeApprovedProposal(asClient(client), {messageId: 'msg-1', profileId: 'profile-1'}), ExecutorError);
  assertEquals((error as ExecutorError).code, 'COMMUNITY_MISMATCH');
});
