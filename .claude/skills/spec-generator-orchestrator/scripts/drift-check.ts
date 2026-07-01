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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeatureMapDrift, checkToolConsumers, verifyConsumerTruthfulness } from './feature-map.ts';

/** Worker skills the orchestrator delegates to (no registry — declared here). */
export const WORKER_SKILLS: readonly string[] = [
  'create-spec',
  'architecture-research-workflow',
  'cross-spec-reconcile',
  'cross-spec-resolve',
  'spec-backlog',
  'spec-archive', // FR-45 — proof-gated archival worker skill
];

const EMPTY_GRAPH: SpecGraph = {
  version: 1,
  builtAt: '',
  nodes: new Map(),
  edges: [],
  definitions: new Map(),
  backlinks: new Map(),
};

/** Live MCP tool names from the real registry. */
export function liveTools(): string[] {
  return buildToolRegistry(() => EMPTY_GRAPH).map((t) => t.name);
}

/** The live capability surface: real MCP tool names + worker skills. */
export function liveCapabilities(): string[] {
  return [...liveTools(), ...WORKER_SKILLS];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // FR-33: feature-map references every capability.
  const fmap = checkFeatureMapDrift(liveCapabilities());
  process.stdout.write(`${fmap.message}\n`);
  // FR-42a: every live MCP tool has a skill consumer (thin skill, thick server).
  const cons = checkToolConsumers(liveTools());
  process.stdout.write(`${cons.message}\n`);
  // FR-42b: and each declared consumer is TRUTHFUL — the skill really uses the
  // tool (a non-empty table that lies is the 2026-06-07 «сам проверил?» bug).
  const skillsDir = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
  const truth = verifyConsumerTruthfulness((skill) => {
    const p = path.join(skillsDir, skill, 'SKILL.md');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
  });
  process.stdout.write(`${truth.message}\n`);
  if (!fmap.ok || !cons.ok || !truth.ok) process.exit(1);
}
