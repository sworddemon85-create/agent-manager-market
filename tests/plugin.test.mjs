import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('installed hook emits structured context using supplied workspace',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'agent-hook-'));
  try {
    await mkdir(join(dir,'.zcode','agents'),{recursive:true});
    await writeFile(join(dir,'.zcode','agents','custom.md'),'---\nname: custom\ndescription: workspace specialist\n---\nbody');
    const run=spawnSync(process.execPath,['agent-manager/scripts/inventory.mjs'],{input:JSON.stringify({cwd:dir}),encoding:'utf8'});
    assert.equal(run.status,0);
    const result=JSON.parse(run.stdout).hookSpecificOutput;
    assert.equal(result.hookEventName,'SessionStart');
    assert.match(result.additionalContext,/workspace: custom/);
    assert.match(result.additionalContext,/plugin: doc-writer/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('market, plugin and MCP entry points agree',async()=>{
 const manifest=JSON.parse(await readFile('agent-manager/.zcode-plugin/plugin.json','utf8'));
 const market=JSON.parse(await readFile('marketplace.json','utf8'));
 assert.equal(market.plugins[0].version,manifest.version);
 assert.equal(manifest.mcpServers,'.mcp.json');
 const mcp=JSON.parse(await readFile('agent-manager/.mcp.json','utf8'));
 assert.equal(mcp.mcpServers['agent-team'].command,'node');
 for(const arg of mcp.mcpServers['agent-team'].args) await readFile(arg.replace('${ZCODE_PLUGIN_ROOT}','agent-manager'));
 assert.equal(manifest.hooks,undefined);
});
