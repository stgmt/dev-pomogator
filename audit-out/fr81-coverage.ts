/**
 * FR-81 focused status after Docker filtered run.
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
  const tool = registry.find((t) => t.name === 'get_spec_status');
  if (!tool) throw new Error('missing get_spec_status');
  const result = await tool.handler({ spec: 'spec-generator-v4', view: 'coverage' } as never);
  const parsed = JSON.parse((result as { content: Array<{ text: string }> }).content[0].text);
  const want = ['665', '666', '667', '668', '669'];
  const scenarios = parsed.scenarios ?? parsed.coverage?.scenarios ?? [];
  const list = Array.isArray(scenarios)
    ? scenarios
    : Object.entries(parsed.buckets ?? {}).flatMap(([bucket, ids]) =>
        (ids as string[]).filter((id) => want.some((n) => id.includes(n))).map((id) => ({ id, bucket })),
      );
  const focused =
    list.length > 0
      ? list.filter((s: { id?: string; scenario_id?: string }) =>
          want.some((n) => String(s.id ?? s.scenario_id ?? s).includes(n)),
        )
      : null;
  const buckets = parsed.buckets ?? {};
  const fr81FromBuckets = Object.fromEntries(
    Object.entries(buckets).map(([b, ids]) => [
      b,
      (ids as string[]).filter((id) => want.some((n) => id.includes(`specgen004-${n}`) || id.includes(`_${n}`))),
    ]),
  );
  const out = {
    ok: parsed.ok !== false,
    lifecycle_note:
      'Canonical suite not updated by filtered @feature81 run; 665–667 passed in Docker filtered; 668–669 pending live',
    fr81_buckets: fr81FromBuckets,
    focused,
  };
  fs.writeFileSync('audit-out/fr81-coverage-focus.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
