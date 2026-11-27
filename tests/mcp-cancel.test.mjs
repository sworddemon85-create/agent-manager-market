import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createServer } from 'node:http';
import { once } from 'node:events';

async function within(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out: ' + label)), 5000);
    })]);
  } finally { clearTimeout(timer); }
}

test('MCP cancellation recovers the busy slot and EOF terminates active work', async t => {
  let calls = 0, announceStart, announceClose, announceFinalStart;
  const started = new Promise(resolve => { announceStart = resolve; });
  const closed = new Promise(resolve => { announceClose = resolve; });
  const finalStarted = new Promise(resolve => { announceFinalStart = resolve; });
  const provider = createServer(async (req, res) => {
    for await (const chunk of req) {}
    calls++;
    if (calls === 1 || calls === 3) {
      res.once('close', announceClose);
      if (calls === 1) announceStart();
      else announceFinalStart();
      return; // Keep the first request pending until the client aborts it.
    }
    res.end(JSON.stringify({ choices: [{ message: { content: 'recovered' } }] }));
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve));
  const child = spawn(process.execPath, ['agent-manager/runtime/server.mjs'], {
    env: { ...process.env, AGENT_API_BASE: `http://127.0.0.1:${provider.address().port}/v1`, AGENT_API_KEY: 'test', AGENT_MODEL: 'test' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const exit = once(child, 'close');
  const lines = createInterface({ input: child.stdout });
  const replies = new Map();
  const seen = [];
  let sequence = 0;
  lines.on('line', line => {
    const message = JSON.parse(line);
    seen.push(message);
    const resolve = replies.get(message.id);
    replies.delete(message.id);
    resolve?.(message);
  });
  t.after(async () => {
    lines.close();
    child.kill();
    await within(exit, 'child exit');
    provider.closeAllConnections();
    await new Promise(resolve => provider.close(resolve));
  });
  const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  function request(method, params) {
    const id = ++sequence;
    const result = new Promise(resolve => replies.set(id, resolve));
    send({ id, method, params });
    return { id, result };
  }
  const plan = { concurrency: 1, tasks: [{ id: 'running', prompt: 'hold' }, { id: 'queued', prompt: 'later' }] };
  const first = request('tools/call', { name: 'team_run', arguments: plan });
  await within(started, 'provider request');
  const busy = await within(request('tools/call', { name: 'team_run', arguments: plan }).result, 'busy rejection');
  assert.equal(busy.result.isError, true);
  assert.match(busy.result.content[0].text, /already running/);
  send({ method: 'notifications/cancelled', params: { requestId: 'unknown' } });
  await within(request('ping', {}).result, 'ping while busy');
  assert.equal(seen.some(message => message.id === first.id), false);
  send({ method: 'notifications/cancelled', params: { requestId: first.id } });
  const cancelled = await within(first.result, 'cancelled team response');
  assert.equal(cancelled.result.isError, true);
  const result = JSON.parse(cancelled.result.content[0].text);
  assert.equal(result.status, 'incomplete');
  assert.equal(result.tasks.running.status, 'cancelled');
  assert.equal(result.tasks.queued.status, 'cancelled');
  await within(closed, 'HTTP connection closed');
  assert.equal(calls, 1);
  const next = request('tools/call', { name: 'team_run', arguments: { tasks: [{ id: 'new', prompt: 'retry' }] } });
  const recovered = await within(next.result, 'next team response');
  assert.equal(recovered.result.isError, false);
  assert.equal(JSON.parse(recovered.result.content[0].text).tasks.new.output, 'recovered');
  assert.equal(calls, 2);
  assert.equal(seen.filter(message => message.id === first.id).length, 1);
  const final = request('tools/call', { name: 'team_run', arguments: plan });
  await within(finalStarted, 'final provider request');
  child.stdin.end();
  const shutdown = await within(final.result, 'EOF cancellation response');
  const shutdownTasks = JSON.parse(shutdown.result.content[0].text).tasks;
  assert.equal(shutdownTasks.running.status, 'cancelled');
  assert.equal(shutdownTasks.queued.status, 'cancelled');
  const [code] = await within(exit, 'graceful EOF exit');
  assert.equal(code, 0);
  assert.equal(calls, 3);
});
