// Explicitly opt in: this script sends the example plan to your model provider.
import {readFile} from 'node:fs/promises';
import {runTeam,createModelWorker} from '../agent-manager/runtime/team.mjs';
const plan=JSON.parse(await readFile(new URL('../examples/review-plan.json',import.meta.url),'utf8'));
const worker=createModelWorker({baseUrl:process.env.AGENT_API_BASE,apiKey:process.env.AGENT_API_KEY,model:process.env.AGENT_MODEL});
const result=await runTeam(plan,worker,{concurrency:2});
console.log(JSON.stringify(result,null,2));
if(result.status!=='completed')process.exitCode=1;
