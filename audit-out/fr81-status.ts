/**
 * FR-81 status snapshot via door tools.
 */
import { buildToolRegistry } from '../tools/spec-mcp-server/tools.ts';
import { buildGraph } from '../tools/spec-graph/builder.ts';
import type { SpecGraph } from '../tools/spec-graph/types.ts';
import fs from 'node:fs';

async function main(): Promise<void> {
  let cached: SpecGraph | undefined;
  const getGraph = (): SpecGraph =>
    (cached ??= buildGraph({ repoRoot: process.cwd(), skipNdjson: true }));
  const registry = buildToolRegistry(getGraph, {
    refreshGraph: () => {
      cached = undefined;
    },
  });

  async function call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = registry.find((t) => t.name === name);
    if (!tool) throw new Error(`missing ${name}`);
    const result = await tool.handler(args as never);
    return JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
  }

  const status = await call('get_spec_status', {
    spec: 'spec-generator-v4',
    view: 'summary',
  });
  fs.writeFileSync('audit-out/fr81-spec-status.json', JSON.stringify(status, null, 2));
  console.log('wrote audit-out/fr81-spec-status.json');

  // Focus FR-81 coverage if tool supports filters
  const coverage = await call('get_spec_status', {
    spec: 'spec-generator-v4',
    view: 'coverage',
  });
  const text = JSON.stringify(coverage);
  const hits = ['SPECGEN004_665', 'SPECGEN004_666', 'SPECGEN004_667', 'SPECGEN004_668', 'SPECGEN004_669', 'FR-81']
    .map((k) => ({ k, present: text.includes(k) }));
  console.log(JSON.stringify({ fr81_keys: hits }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
