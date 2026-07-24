/** Graph-derived delivery demand evaluation (FR-66 / GitHub #169). */
import type { DeliveryDemand, DemandEvidenceState, DemandType, MetadataIssue, RequirementMetadata } from './metadata-schema.ts';
import type { FrNode, SpecGraph } from './types.ts';

export type DeliveryOverall = 'NOT_DECLARED' | 'DELIVERED' | 'INCOMPLETE';

export interface EvaluatedDemand extends DeliveryDemand {
  state: DemandEvidenceState;
  inheritedFrom?: string[];
}

export interface DeliveryEvaluation {
  overall: DeliveryOverall;
  demands: EvaluatedDemand[];
  missing: DemandType[];
  issues: MetadataIssue[];
}

function evidenceState(fr: FrNode, demand: DeliveryDemand, graph: SpecGraph): DemandEvidenceState {
  if (demand.state) return demand.state;
  if (demand.obligation === 'not-applicable') return 'NOT_APPLICABLE';
  const refs = demand.evidenceRefs ?? [];
  if (refs.length > 0) return refs.every((ref) => graph.nodes.has(ref) || graph.nodes.has(`${fr.spec}:${ref}`)) ? 'PRESENT' : 'MISSING';
  if (demand.type === 'implementation') return graph.edges.some((edge) => edge.from === fr.id && edge.type === 'implements') ? 'PRESENT' : 'MISSING';
  if (demand.type === 'integration-test') {
    const scenarios = graph.edges.filter((edge) => edge.to === fr.id && edge.type === 'tested-by').map((edge) => graph.nodes.get(edge.from));
    return scenarios.some((node) => node?.type === 'Scenario' && node.lastResult === 'PASSED' && node.resultStale !== true) ? 'PRESENT' : 'MISSING';
  }
  return 'MISSING';
}

function satisfied(demand: EvaluatedDemand): boolean {
  if (demand.obligation === 'optional') return true;
  if (demand.state === 'PRESENT') return true;
  if (demand.state === 'NOT_APPLICABLE') return demand.obligation === 'not-applicable' && Boolean(demand.rationale);
  return demand.state === 'WAIVED' && Boolean(demand.rationale && demand.actor && demand.auditRef);
}

export function evaluateDelivery(fr: FrNode, graph: SpecGraph): DeliveryEvaluation {
  const metadata = fr.metadata;
  if (!metadata) return { overall: 'NOT_DECLARED', demands: [], missing: [], issues: [] };
  const inherited = forwardedDemands(graph).get(fr.id);
  const merged = new Map<DemandType, DeliveryDemand>((inherited?.demands ?? []).map((demand) => [demand.type, demand]));
  for (const demand of metadata.demands) merged.set(demand.type, demand);
  const demands = [...merged.values()].map((demand) => ({ ...demand, state: evidenceState(fr, demand, graph) }));
  const required = demands.filter((demand) => demand.obligation !== 'optional');
  const complete = required.length > 0 && required.every(satisfied);
  return {
    overall: complete ? 'DELIVERED' : 'INCOMPLETE',
    demands,
    missing: required.filter((demand) => !satisfied(demand)).map((demand) => demand.type),
    issues: [...(fr.metadataIssues ?? []), ...(inherited?.issues ?? [])],
  };
}

const obligationRank: Record<DeliveryDemand['obligation'], number> = { 'not-applicable': 0, optional: 1, required: 2 };

/** Resolve explicit forwardTo references with deterministic required-wins merge. */
export function forwardedDemands(graph: SpecGraph): Map<string, { demands: DeliveryDemand[]; issues: MetadataIssue[] }> {
  const out = new Map<string, { demands: Map<DemandType, DeliveryDemand>; issues: MetadataIssue[] }>();
  const ensure = (id: string): { demands: Map<DemandType, DeliveryDemand>; issues: MetadataIssue[] } => {
    const current = out.get(id);
    if (current) return current;
    const created = { demands: new Map<DemandType, DeliveryDemand>(), issues: [] as MetadataIssue[] };
    out.set(id, created);
    return created;
  };
  for (const node of graph.nodes.values()) {
    if (node.type !== 'FR' || !node.metadata) continue;
    for (const demand of node.metadata.demands) for (const rawTarget of demand.forwardTo ?? []) {
      const target = graph.nodes.has(rawTarget) ? rawTarget : node.spec ? `${node.spec}:${rawTarget}` : rawTarget;
      const bucket = ensure(target);
      const existing = bucket.demands.get(demand.type);
      const targetNode = graph.nodes.get(target);
      const targetDemand = targetNode?.type === 'FR' ? targetNode.metadata?.demands.find((item) => item.type === demand.type) : undefined;
      const candidates = [existing, targetDemand].filter((item): item is DeliveryDemand => Boolean(item));
      if (candidates.some((item) => item.obligation === 'required') && [demand, ...candidates].some((item) => item.obligation === 'not-applicable')) {
        bucket.issues.push({ code: 'FR_DEMAND_CONFLICT', path: `${node.id}->${target}:${demand.type}`, message: `required and not-applicable conflict for ${demand.type}` });
      }
      const strongest = [demand, ...candidates].sort((a, b) => obligationRank[b.obligation] - obligationRank[a.obligation])[0];
      bucket.demands.set(demand.type, strongest);
    }
  }
  return new Map([...out].map(([id, value]) => [id, { demands: [...value.demands.values()], issues: value.issues }]));
}
