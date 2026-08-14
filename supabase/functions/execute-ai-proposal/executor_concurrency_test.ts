// This file fires genuinely concurrent requests (Promise.all, no artificial ordering)
// at executor.ts's real executeApprovedProposal(), through a mock RPC layer that
// faithfully reproduces the one guarantee migration 006 relies on: a second
// `SELECT ... FOR UPDATE` on the same row blocks until the first transaction
// finishes, then observes its committed result. It is not a substitute for running
// the real claim against Postgres (this sandbox has no Docker/local Supabase
// stack — see docs/THREAT_MODEL_SPRINT7.md and the FINAL REPORT for how to run
// supabase/tests/ai_proposal_execution_staging.sql for that), but it does exercise
// real async interleaving of the orchestration code, not two sequential awaits
// dressed up as "concurrent".
import {assertEquals, assert} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type {SupabaseClient} from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import {ExecutorError, executeApprovedProposal} from './executor.ts';

type Row = Record<string, unknown>;

class RowLock {
  private tail: Promise<void> = Promise.resolve();
  private held = false;
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => (release = resolve));
    await previous;
    assert(!this.held, 'row lock was acquired twice concurrently');
    this.held = true;
    try {
      return await fn();
    } finally {
      this.held = false;
      release();
    }
  }
}

function makeConcurrentDb() {
  const message: Row = {
    id: 'msg-1',
    community_id: 'community-1',
    session_id: 'session-1',
    proposal: {actions: [{kind: 'create_task', target: 'task', payload: {title: '準備', description: null, status: null, priority: null, assignee_id: null, due_date: null}}]},
    proposal_status: 'approved',
  };
  const lock = new RowLock();

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
      return {data: match ? {...match} : null, error: null};
    }
  }

  const client = {
    from(table: string) {
      if (table === 'ai_conversation_messages') return new FakeQuery([message]);
      if (table === 'ai_conversation_sessions') return new FakeQuery([{id: 'session-1', profile_id: 'profile-1', community_id: 'community-1'}]);
      if (table === 'community_members') return new FakeQuery([{community_id: 'community-1', profile_id: 'profile-1', active: true}]);
      throw new Error(`unexpected table ${table}`);
    },
    async rpc(name: string, _args: Record<string, unknown>) {
      if (name === 'mark_ai_proposal_failed') return {data: message, error: null};
      if (name !== 'execute_ai_proposal') throw new Error(`unexpected rpc ${name}`);
      // Emulates: BEGIN; SELECT ... FOR UPDATE; check status; claim; write; COMMIT.
      return lock.withLock(async () => {
        if (message.proposal_status === 'executing') return {data: null, error: {code: 'AI002'}};
        if (message.proposal_status === 'executed') return {data: null, error: {code: 'AI003'}};
        message.proposal_status = 'executing';
        await new Promise(resolve => setTimeout(resolve, 1)); // widen the interleaving window
        message.proposal_status = 'executed';
        return {data: {...message}, error: null};
      });
    },
  };
  return client as unknown as SupabaseClient;
}

Deno.test('concurrent execute calls: exactly one wins, the other sees ALREADY_EXECUTING/ALREADY_EXECUTED', async () => {
  for (let trial = 0; trial < 25; trial++) {
    const client = makeConcurrentDb();
    const call = () => executeApprovedProposal(client, {messageId: 'msg-1', profileId: 'profile-1'});

    const [a, b] = await Promise.allSettled([call(), call()]);

    const outcomes = [a, b].map(result => (result.status === 'fulfilled' ? 'executed' : (result.reason as ExecutorError).code));
    const executedCount = outcomes.filter(o => o === 'executed').length;
    const rejectedAsDuplicate = outcomes.filter(o => o === 'ALREADY_EXECUTING' || o === 'ALREADY_EXECUTED').length;

    assertEquals(executedCount, 1, `trial ${trial}: expected exactly one winner, got outcomes ${outcomes.join(',')}`);
    assertEquals(rejectedAsDuplicate, 1, `trial ${trial}: expected exactly one duplicate rejection, got outcomes ${outcomes.join(',')}`);
  }
});
