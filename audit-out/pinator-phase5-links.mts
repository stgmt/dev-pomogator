/**
 * Phase 5: cross-link bg-task-guard + prompt-suggest READMEs to pinator M4/M5.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';

const root = process.cwd();
let cached: ReturnType<typeof buildGraph> | undefined;
const tools = buildToolRegistry(
  () => (cached ??= buildGraph({ repoRoot: root, skipNdjson: true })),
  { refreshGraph: () => { cached = undefined; } },
);
const txn = tools.find((t) => t.name === 'apply_spec_transaction')!;

const bgPath = path.join(root, '.specs', 'bg-task-guard', 'README.md');
const psPath = path.join(root, '.specs', 'prompt-suggest', 'README.md');
let bg = fs.readFileSync(bgPath, 'utf8');
let ps = fs.readFileSync(psPath, 'utf8');

if (!bg.includes('Consumed by Pinator M4')) {
  bg += `\n## Related\n\nConsumed by [Pinator M4 (async)](../pinator/README.md) — Stop-judge waits on in-flight bg work via this guard. Pinator owns eligibility/judge; this spec owns the bg marker/TTL contract.\n`;
}
if (!ps.includes('optional Pinator M5')) {
  ps += `\n## Related\n\nOptional [Pinator M5](../pinator/README.md) sibling: user-facing next-prompt hints. **Not** the Stop-judge. Build script: \`npm run build:prompt-suggest\` (formerly misnamed \`build:pinator\`).\n`;
}

const result = await txn.handler({
  edits: [
    { spec: 'bg-task-guard', doc: 'README.md', content: bg },
    { spec: 'prompt-suggest', doc: 'README.md', content: ps },
  ],
  reason: 'pinator wave phase5: M4/M5 dependency links',
});
console.log(result.content[0].text.slice(0, 2000));
