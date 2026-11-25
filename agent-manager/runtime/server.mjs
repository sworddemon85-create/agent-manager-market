import { createInterface } from 'node:readline';
import { runTeam, createModelWorker } from './team.mjs';
const inflight = new Map();
const send = value => process.stdout.write(JSON.stringify({jsonrpc:'2.0', ...value}) + '\n');
const schema = {type:'object', required:['tasks'], additionalProperties:false, properties:{concurrency:{type:'integer',minimum:1,maximum:8},tasks:{type:'array',minItems:1,maxItems:32,items:{type:'object',required:['id','prompt'],additionalProperties:false,properties:{id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,64}$'},prompt:{type:'string',minLength:1},context:{type:'string'},agent:{type:'string',enum:['doc-writer','test-runner','issue-triage']},dependsOn:{type:'array',items:{type:'string'}}}}}}};
async function handle(message) {
  if(message.method === 'notifications/cancelled') { inflight.get(message.params?.requestId)?.abort(); return; }
  if(message.id === undefined) return;
  const id=message.id;
  if(message.method === 'initialize') return send({id,result:{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'agent-manager',version:'0.2.0'}}});
  if(message.method === 'ping') return send({id,result:{}});
  if(message.method === 'tools/list') return send({id,result:{tools:[{name:'team_run',description:'Run independent model workers concurrently, then dependent workers with upstream outputs. Sends supplied context to the configured provider. Workers have no filesystem or command tools.',inputSchema:schema}]}});
  if(message.method !== 'tools/call') return send({id,error:{code:-32601,message:'Method not found'}});
  if(message.params?.name !== 'team_run') return send({id,error:{code:-32602,message:'Unknown tool'}});
  if(inflight.size) return send({id,result:{isError:true,content:[{type:'text',text:'A team is already running; wait or cancel it first.'}]}});
  const controller=new AbortController(); inflight.set(id,controller);
  try {
    const plan=message.params.arguments;
    const worker=createModelWorker({baseUrl:process.env.AGENT_API_BASE,apiKey:process.env.AGENT_API_KEY,model:process.env.AGENT_MODEL});
    const result=await runTeam(plan,worker,{concurrency:plan?.concurrency ?? 3,signal:controller.signal});
    send({id,result:{isError:result.status!=='completed',content:[{type:'text',text:JSON.stringify(result)}]}});
  } catch(error) {send({id,result:{isError:true,content:[{type:'text',text:error.message}]}});}
  finally {inflight.delete(id);}
}
const lines=createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',line=>{try {void handle(JSON.parse(line)).catch(()=>send({id:null,error:{code:-32603,message:'Internal error'}}));} catch {send({id:null,error:{code:-32700,message:'Parse error'}});}});
lines.on('close',()=>{for(const controller of inflight.values())controller.abort();});
process.once('SIGTERM',()=>{for(const controller of inflight.values())controller.abort();lines.close();});
