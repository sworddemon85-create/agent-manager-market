import test from 'node:test';
import assert from 'node:assert/strict';
import { runTeam, validatePlan, createModelWorker } from '../agent-manager/runtime/team.mjs';
import { createServer } from 'node:http';
import { getEventListeners } from 'node:events';

test('settled workers remove cancellation listeners', async () => {
  for (const fails of [false, true]) {
    const controller = new AbortController();
    const tasks = Array.from({ length: 32 }, (_, index) => ({ id: 'task' + index, prompt: 'work' }));
    await runTeam({ tasks }, async () => {
      if (fails) throw new Error('worker failed');
      return 'done';
    }, { concurrency: 8, signal: controller.signal });
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
});

test('cancellation returns even when an active worker ignores the signal', async () => {
  const controller = new AbortController();
  let release, announceStart;
  const started = new Promise(resolve => { announceStart = resolve; });
  const calls = [];
  const work = runTeam({ tasks: [
    { id: 'active', prompt: 'work' },
    { id: 'dependent', prompt: 'next', dependsOn: ['active'] },
    { id: 'queued', prompt: 'later' },
  ] }, task => {
    calls.push(task.id);
    announceStart();
    return new Promise(resolve => { release = resolve; });
  }, { concurrency: 1, signal: controller.signal });
  await started;
  controller.abort();
  let timer;
  try {
    const result = await Promise.race([
      work,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cancellation did not settle the team')), 250); }),
    ]);
    assert.equal(result.status, 'incomplete');
    for (const value of Object.values(result.tasks)) assert.equal(value.status, 'cancelled');
    assert.deepEqual(calls, ['active']);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    const snapshot = JSON.stringify(result);
    release('late output');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(JSON.stringify(result), snapshot);
  } finally {
    clearTimeout(timer);
    release('cleanup');
    await work;
  }
});

test('abort before the worker microtask runs does not invoke queued workers', async () => {
  const controller = new AbortController();
  let calls = 0;
  const work = runTeam({ tasks: [{ id: 'a', prompt: 'a' }] }, () => { calls++; return 'output'; }, { signal: controller.signal });
  controller.abort();
  const result = await work;
  assert.equal(calls, 0);
  assert.equal(result.tasks.a.status, 'cancelled');
});

test('a late rejection after cancellation is handled without changing the result', async () => {
  const controller = new AbortController();
  let fail, announceStart;
  const started = new Promise(resolve => { announceStart = resolve; });
  const work = runTeam({ tasks: [{ id: 'a', prompt: 'a' }] }, () => {
    announceStart();
    return new Promise((_, reject) => { fail = reject; });
  }, { signal: controller.signal });
  await started;
  controller.abort();
  fail(new Error('Late provider error'));
  const result = await work;
  assert.equal(result.tasks.a.status, 'cancelled');
});

test('independent agents overlap; dependent agent gets both results', async () => {
  let active = 0, peak = 0;
  const result = await runTeam({tasks:[{id:'a',prompt:'a'},{id:'b',prompt:'b'},{id:'c',prompt:'c',dependsOn:['a','b']}]}, async (t,deps) => {
    active++; peak = Math.max(peak,active);
    if(t.id === 'c') assert.deepEqual(deps,{a:'a',b:'b'});
    await new Promise(r=>setTimeout(r,30)); active--; return t.id;
  });
  assert.equal(peak,2); assert.equal(result.status,'completed');
});
test('failure blocks descendants but independent task finishes', async()=>{
  const result = await runTeam({tasks:[{id:'a',prompt:'a'},{id:'b',prompt:'b',dependsOn:['a']},{id:'c',prompt:'c'}]},async t=>{if(t.id==='a')throw new Error('failure');return t.id;});
  assert.equal(result.tasks.b.status,'blocked'); assert.equal(result.tasks.c.status,'completed');
});
test('reject cycles, missing dependencies and duplicate ids',()=>{
  for(const tasks of [[{id:'a',prompt:'a',dependsOn:['a']}],[{id:'a',prompt:'a',dependsOn:['b']}],[{id:'a',prompt:'a'},{id:'a',prompt:'b'}]]) assert.throws(()=>validatePlan({tasks}));
});
test('model worker sends separate requests over HTTP and passes upstream output',async()=>{
  const seen=[];
  const server=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;seen.push(JSON.parse(raw));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'result-'+seen.length}}]}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const worker=createModelWorker({baseUrl:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'test',model:'test'});
    const result=await runTeam({tasks:[{id:'a',prompt:'analyze',agent:'issue-triage'},{id:'b',prompt:'summarize',dependsOn:['a']}]},worker);
    assert.equal(result.status,'completed'); assert.equal(seen.length,2);
    assert.equal(JSON.parse(seen[1].messages[1].content).dependencies.a,'result-1');
  } finally {await new Promise(r=>server.close(r));}
});

test('concurrency limit and cancellation stop queued work', async()=>{
  const controller=new AbortController(); let calls=0;
  const result=await runTeam({tasks:[{id:'a',prompt:'a'},{id:'b',prompt:'b'}]},async()=>{calls++;controller.abort();throw new Error('cancelled');},{concurrency:1,signal:controller.signal});
  assert.equal(calls,1);assert.equal(result.tasks.a.status,'cancelled');assert.equal(result.tasks.b.status,'cancelled');
});
test('invalid context and concurrency are rejected',async()=>{
  assert.throws(()=>validatePlan({tasks:[{id:'a',prompt:'x',context:{secret:'x'}}]}));
  await assert.rejects(runTeam({tasks:[{id:'a',prompt:'x'}]},async()=>'',{concurrency:0}));
});
test('provider errors and timeouts propagate instead of reporting success',async()=>{
  const server=createServer((req,res)=>{if(req.url.includes('error')){res.writeHead(429);res.end('private response');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(createModelWorker({baseUrl:base+'/error',apiKey:'test',model:'test'})({prompt:'x'},{}),/HTTP 429/);
    await assert.rejects(createModelWorker({baseUrl:base,apiKey:'test',model:'test',timeoutMs:25})({prompt:'x'},{}),/timeout/i);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});
