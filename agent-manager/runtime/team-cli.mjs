import { readFile } from 'node:fs/promises';
import { runTeam, createModelWorker } from './team.mjs';
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
try {
  if (!process.argv[2]) throw new Error('Usage: node team-cli.mjs plan.json');
  const plan = JSON.parse(await readFile(process.argv[2], 'utf8'));
  const worker = createModelWorker({ baseUrl: process.env.AGENT_API_BASE, apiKey: process.env.AGENT_API_KEY, model: process.env.AGENT_MODEL });
  const result = await runTeam(plan, worker, { concurrency: plan.concurrency ?? 3, signal: controller.signal });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'completed') process.exitCode = 1;
} catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
