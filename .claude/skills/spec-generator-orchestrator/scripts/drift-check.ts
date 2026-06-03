// spec-generator-orchestrator drift guard CLI (FR-33 / AC-33.5).
//
// Lists the live capability surface (MCP tool names from the real registry +
// the worker skills the orchestrator delegates to) and fails with a non-zero
// exit when any of them is NOT referenced by the feature map. This is the
// FR-32 honesty discipline turned on the orchestrator itself: a workflow that
// silently gains a capability the map doesn't know about is drift.

import { pathToFileURL } from 'node:url';
import { buildToolRegistry } from '../../../../tools/spec-mcp-server/tools.ts';
import type { SpecGraph } from '../../../../tools/spec-graph/types.ts';
import { checkFeatureMapDrift } from './feature-map.ts';

/** Worker skills the orchestrator delegates to (no registry — declared here). */
export const WORKER_SKILLS: readonly string[] = [
  'create-spec',
  'architecture-research-workflow',
  'cross-spec-reconcile',
  'cross-spec-resolve',
  'spec-backlog',
];

/** The live capability surface: real MCP tool names + worker skills. */
export function liveCapabilities(): string[] {
  const emptyGraph: SpecGraph = {
    version: 1,
    builtAt: '',
    nodes: new Map(),
    edges: [],
    definitions: new Map(),
    backlinks: new Map(),
  };
  const toolNames = buildToolRegistry(() => emptyGraph).map((t) => t.name);
  return [...toolNames, ...WORKER_SKILLS];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const res = checkFeatureMapDrift(liveCapabilities());
  process.stdout.write(`${res.message}\n`);
  if (!res.ok) process.exit(1);
}
