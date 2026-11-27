import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createServer} from 'node:http';
test('MCP subprocess initializes and executes a complete team via provider',async()=>{
  let calls=0;
  const provider=createServer(async(req,res)=>{for await(const chunk of req){} calls++;res.end(JSON.stringify({choices:[{message:{content:'worker output'}}]}));});
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));
  const child=spawn(process.execPath,['agent-manager/runtime/server.mjs'],{env:{...process.env,AGENT_API_BASE:`http://127.0.0.1:${provider.address().port}/v1`,AGENT_API_KEY:'test',AGENT_MODEL:'test'},stdio:['pipe','pipe','pipe']});
  const pending=new Map();
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{const msg=JSON.parse(line);pending.get(msg.id)?.(msg);});
  let id=0;
  function request(method,params){return new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(new Error('protocol timeout')),5000);pending.set(n,msg=>{clearTimeout(timer);pending.delete(n);resolve(msg);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');});}
  try {
    assert.ok((await request('initialize',{})).result.capabilities.tools);
    assert.equal((await request('tools/list',{})).result.tools[0].name,'team_run');
    const result=await request('tools/call',{name:'team_run',arguments:{tasks:[{id:'a',prompt:'analyze'},{id:'b',prompt:'review'},{id:'c',prompt:'combine',dependsOn:['a','b']}]}});
    assert.equal(result.result.isError,false);assert.equal(calls,3);
    assert.equal(JSON.parse(result.result.content[0].text).tasks.c.status,'completed');
  } finally {child.stdin.end();await new Promise(r=>child.once('exit',r));lines.close();await new Promise(r=>provider.close(r));}
});
