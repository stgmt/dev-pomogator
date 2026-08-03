import type { Edge, EdgeType, EndpointViolation, NodeType, SpecGraph } from './types.ts';

export interface EndpointRule {
  sources: readonly NodeType[];
  targets: readonly NodeType[];
  syntheticTarget?: 'result' | 'trace';
}

export type { EndpointViolation } from './types.ts';

export const EDGE_SCHEMA = {
  refs: {
    sources: ['Task'],
    targets: ['FR', 'NFR', 'AC', 'Scenario'],
  },
  covers: {
    sources: ['FR', 'NFR'],
    targets: ['AC', 'Story', 'Decision'],
  },
  'tested-by': {
    sources: ['FR', 'NFR', 'AC'],
    targets: ['Scenario'],
  },
  verifies: {
    sources: ['Scenario', 'AC'],
    targets: ['FR', 'NFR'],
  },
  entitles: {
    sources: ['Decision', 'UseCase'],
    targets: ['FR', 'NFR', 'Task'],
  },
  'tagged-by': {
    sources: ['Scenario'],
    targets: ['FR', 'NFR', 'AC'],
  },
  implements: {
    sources: ['FR', 'NFR'],
    targets: ['File'],
  },
  'last-result': {
    sources: ['Scenario'],
    targets: [],
    syntheticTarget: 'result',
  },
  'runtime-trace': {
    sources: ['Scenario'],
    targets: [],
    syntheticTarget: 'trace',
  },
  'step-binding': {
    sources: ['Scenario'],
    targets: ['StepBinding'],
  },
  'code-impl': {
    sources: ['FR', 'NFR', 'AC', 'Scenario'],
    targets: ['File'],
  },
  'evidenced-by': {
    sources: ['FR', 'NFR', 'AC', 'Scenario'],
    targets: ['Evidence'],
  },
} as const satisfies Record<EdgeType, EndpointRule>;

function syntheticTargetMatches(rule: EndpointRule, target: string): boolean {
  if (rule.syntheticTarget === 'result') return target.startsWith('RESULT-');
  if (rule.syntheticTarget === 'trace') return target.startsWith('TRACE-');
  return false;
}

export function validateEdgeEndpoints(
  edge: Edge,
  graph: Pick<SpecGraph, 'nodes'>,
): EndpointViolation | null {
  const source = graph.nodes.get(edge.from);
  const target = graph.nodes.get(edge.to);
  if (!source || (!target && syntheticTargetMatches(EDGE_SCHEMA[edge.type], edge.to))) return null;
  if (!source || !target) return null;

  const rule = EDGE_SCHEMA[edge.type];
  if (rule.sources.includes(source.type as never) && rule.targets.includes(target.type as never)) return null;
  return {
    code: 'ENDPOINT_VIOLATION',
    edge,
    actualSource: source.type,
    actualTarget: target.type,
    allowedSources: rule.sources,
    allowedTargets: rule.targets,
  };
}

export function validateGraphEdgeEndpoints(
  graph: Pick<SpecGraph, 'nodes' | 'edges'>,
): EndpointViolation[] {
  const violations: EndpointViolation[] = [];
  for (const edge of graph.edges) {
    const violation = validateEdgeEndpoints(edge, graph);
    if (violation) violations.push(violation);
  }
  return violations;
}

export function refreshEndpointViolations(graph: SpecGraph): EndpointViolation[] {
  const violations = validateGraphEdgeEndpoints(graph);
  graph.endpointViolations = violations;
  return violations;
}

export function appendValidatedEdge(graph: SpecGraph, edge: Edge): EndpointViolation | null {
  graph.edges.push(edge);
  const violation = validateEdgeEndpoints(edge, graph);
  if (violation) {
    const existing = graph.endpointViolations ?? [];
    graph.endpointViolations = [...existing, violation];
  }
  return violation;
}

export function endpointViolationKey(violation: EndpointViolation): string {
  return `${violation.edge.type}|${violation.edge.from}|${violation.edge.to}|${violation.actualSource}|${violation.actualTarget}`;
}
