import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Discovery is informational: runtime agent availability remains authoritative.
async function inventory(dir, scope) {
  const lines = [];
  try {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        const text = await readFile(join(dir, entry.name), 'utf8');
        const header = text.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
        if (!header) continue;
        const field = key => header.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'))?.[1].trim().replace(/^(["'])(.*)\1$/, '$2');
        lines.push(`${scope}: ${field('name') || entry.name.slice(0,-3)} — ${(field('description') || '').slice(0,160)}`);
      } catch { /* One unreadable definition must not prevent startup. */ }
    }
  } catch { /* Missing optional directories are normal. */ }
  return lines;
}

try {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = raw.trim() ? JSON.parse(raw) : {};
  const lines = (await Promise.all([
    inventory(join(homedir(), '.zcode', 'agents'), 'user'),
    inventory(join(input.cwd || process.cwd(), '.zcode', 'agents'), 'workspace'),
    inventory(fileURLToPath(new URL('../agents/', import.meta.url)), 'plugin'),
  ])).flat();
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: 'Agent Manager definitions (discovery only; use runtime agent types to dispatch):\n' + (lines.join('\n') || '(none)'),
  } }) + '\n');
} catch (error) {
  process.stderr.write('Agent Manager inventory unavailable: ' + error.message + '\n');
}
