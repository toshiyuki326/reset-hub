import {assertEquals} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {validateExecutableActions} from './taskExecutor.ts';

const payload = {
  title: null,
  description: null,
  status: null,
  priority: null,
  assignee_id: null,
  due_date: null,
};

Deno.test('accepts a single create_task action', () => {
  const result = validateExecutableActions({actions: [{kind: 'create_task', target: 'task', payload: {...payload, title: '準備'}}]});
  assertEquals(result, null);
});

Deno.test('accepts a single update_task action with a target id', () => {
  const result = validateExecutableActions({
    actions: [{kind: 'update_task', target: '11111111-1111-1111-1111-111111111111', payload}],
  });
  assertEquals(result, null);
});

Deno.test('rejects an unsupported action kind', () => {
  const result = validateExecutableActions({actions: [{kind: 'create_goal', target: 'goal', payload}]});
  assertEquals(result, {code: 'UNSUPPORTED_ACTION'});
});

Deno.test('rejects a mix of supported and unsupported kinds (no partial execution)', () => {
  const result = validateExecutableActions({
    actions: [
      {kind: 'create_task', target: 'task', payload: {...payload, title: '準備'}},
      {kind: 'create_event', target: 'event', payload},
    ],
  });
  assertEquals(result, {code: 'UNSUPPORTED_ACTION'});
});

Deno.test('rejects create_task with no title', () => {
  const result = validateExecutableActions({actions: [{kind: 'create_task', target: 'task', payload}]});
  assertEquals(result, {code: 'INVALID_ACTION'});
});

Deno.test('rejects update_task with no target', () => {
  const result = validateExecutableActions({actions: [{kind: 'update_task', target: null, payload}]});
  assertEquals(result, {code: 'INVALID_ACTION'});
});

Deno.test('rejects an empty actions array', () => {
  const result = validateExecutableActions({actions: []});
  assertEquals(result, {code: 'INVALID_ACTION'});
});

Deno.test('rejects a malformed proposal shape', () => {
  assertEquals(validateExecutableActions(null), {code: 'INVALID_ACTION'});
  assertEquals(validateExecutableActions({}), {code: 'INVALID_ACTION'});
  assertEquals(validateExecutableActions({actions: [{kind: 'create_task', payload: {title: 'x'}}]}), {code: 'INVALID_ACTION'});
});

Deno.test('rejects an out-of-range priority/status value', () => {
  const result = validateExecutableActions({
    actions: [{kind: 'create_task', target: 'task', payload: {...payload, title: 'x', status: 'deleted'}}],
  });
  assertEquals(result, {code: 'INVALID_ACTION'});
});
