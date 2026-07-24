/** Typed FR/NFR metadata schema shared by parser, MCP and migration (FR-66). */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export const VERIFICATION_METHODS = ['test', 'analysis', 'review', 'inspection', 'demonstration'] as const;
export const SAFETY_CLASSES = ['critical', 'major', 'minor'] as const;
export const DEMAND_TYPES = ['implementation', 'integration-test', 'documentation', 'migration', 'operational-proof'] as const;
export const DEMAND_OBLIGATIONS = ['required', 'optional', 'not-applicable'] as const;
export const DEMAND_STATES = ['PRESENT', 'MISSING', 'NOT_APPLICABLE', 'WAIVED'] as const;

export type VerificationMethod = typeof VERIFICATION_METHODS[number];
export type SafetyClass = typeof SAFETY_CLASSES[number];
export type DemandType = typeof DEMAND_TYPES[number];
export type DemandObligation = typeof DEMAND_OBLIGATIONS[number];
export type DemandEvidenceState = typeof DEMAND_STATES[number];

export interface RequirementRisk {
  id: string;
  likelihood: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  mitigation?: string;
}

export interface DeliveryDemand {
  type: DemandType;
  obligation: DemandObligation;
  state?: DemandEvidenceState;
  rationale?: string;
  actor?: string;
  auditRef?: string;
  evidenceRefs?: string[];
  forwardTo?: string[];
}

export interface RequirementMetadata {
  schemaVersion: 1;
  verificationMethod?: VerificationMethod;
  safetyClass?: SafetyClass;
  rationale?: string;
  risks: RequirementRisk[];
  demands: DeliveryDemand[];
  _unknown: Record<string, unknown>;
}

export interface MetadataIssue {
  code: 'FR_METADATA_INVALID' | 'FR_DEMAND_CONFLICT';
  path: string;
  message: string;
}

export interface MetadataParseResult {
  metadata?: RequirementMetadata;
  issues: MetadataIssue[];
}

const enumValue = <T extends readonly string[]>(value: unknown, values: T): T[number] | undefined =>
  typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T[number] : undefined;

function objectOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function validateRequirementMetadata(value: unknown): MetadataParseResult {
  const issues: MetadataIssue[] = [];
  const raw = objectOf(value);
  if (!raw) return { issues: [{ code: 'FR_METADATA_INVALID', path: '$', message: 'metadata must be an object' }] };
  if (raw.schemaVersion !== 1) issues.push({ code: 'FR_METADATA_INVALID', path: 'schemaVersion', message: 'schemaVersion must be 1' });

  const verificationMethod = raw.verificationMethod === undefined ? undefined : enumValue(raw.verificationMethod, VERIFICATION_METHODS);
  if (raw.verificationMethod !== undefined && !verificationMethod) issues.push({ code: 'FR_METADATA_INVALID', path: 'verificationMethod', message: `must be one of ${VERIFICATION_METHODS.join('|')}` });
  const safetyClass = raw.safetyClass === undefined ? undefined : enumValue(raw.safetyClass, SAFETY_CLASSES);
  if (raw.safetyClass !== undefined && !safetyClass) issues.push({ code: 'FR_METADATA_INVALID', path: 'safetyClass', message: `must be one of ${SAFETY_CLASSES.join('|')}` });

  const risks: RequirementRisk[] = [];
  if (raw.risks !== undefined && !Array.isArray(raw.risks)) issues.push({ code: 'FR_METADATA_INVALID', path: 'risks', message: 'must be an array' });
  for (const [index, value] of (Array.isArray(raw.risks) ? raw.risks : []).entries()) {
    const risk = objectOf(value);
    const likelihood = enumValue(risk?.likelihood, ['low', 'medium', 'high'] as const);
    const impact = enumValue(risk?.impact, ['low', 'medium', 'high'] as const);
    const id = nonEmpty(risk?.id);
    if (!risk || !id || !likelihood || !impact) {
      issues.push({ code: 'FR_METADATA_INVALID', path: `risks[${index}]`, message: 'risk requires id and low|medium|high likelihood/impact' });
      continue;
    }
    risks.push({ id, likelihood, impact, ...(nonEmpty(risk.mitigation) ? { mitigation: nonEmpty(risk.mitigation) } : {}) });
  }

  const demands: DeliveryDemand[] = [];
  const seen = new Set<DemandType>();
  if (raw.demands !== undefined && !Array.isArray(raw.demands)) issues.push({ code: 'FR_METADATA_INVALID', path: 'demands', message: 'must be an array' });
  for (const [index, value] of (Array.isArray(raw.demands) ? raw.demands : []).entries()) {
    const demand = objectOf(value);
    const type = enumValue(demand?.type, DEMAND_TYPES);
    const obligation = enumValue(demand?.obligation, DEMAND_OBLIGATIONS);
    const state = demand?.state === undefined ? undefined : enumValue(demand.state, DEMAND_STATES);
    const rationale = nonEmpty(demand?.rationale);
    const actor = nonEmpty(demand?.actor);
    const auditRef = nonEmpty(demand?.auditRef);
    if (!demand || !type) { issues.push({ code: 'FR_METADATA_INVALID', path: `demands[${index}].type`, message: `must be one of ${DEMAND_TYPES.join('|')}` }); continue; }
    if (!obligation) { issues.push({ code: 'FR_METADATA_INVALID', path: `demands[${index}].obligation`, message: `must be one of ${DEMAND_OBLIGATIONS.join('|')}` }); continue; }
    if (demand.state !== undefined && !state) issues.push({ code: 'FR_METADATA_INVALID', path: `demands[${index}].state`, message: `must be one of ${DEMAND_STATES.join('|')}` });
    if ((obligation === 'optional' || obligation === 'not-applicable' || state === 'NOT_APPLICABLE') && !rationale) issues.push({ code: 'FR_METADATA_INVALID', path: `demands[${index}].rationale`, message: `${obligation}/${state ?? ''} requires rationale` });
    if (state === 'WAIVED' && (!rationale || !actor || !auditRef)) issues.push({ code: 'FR_METADATA_INVALID', path: `demands[${index}]`, message: 'WAIVED requires rationale, actor and auditRef' });
    if (seen.has(type)) issues.push({ code: 'FR_DEMAND_CONFLICT', path: `demands[${index}].type`, message: `duplicate demand type ${type}` });
    seen.add(type);
    const strings = (entry: unknown): string[] | undefined => Array.isArray(entry) ? entry.filter((v): v is string => typeof v === 'string') : undefined;
    demands.push({ type, obligation, ...(state ? { state } : {}), ...(rationale ? { rationale } : {}), ...(actor ? { actor } : {}), ...(auditRef ? { auditRef } : {}), ...(strings(demand.evidenceRefs) ? { evidenceRefs: strings(demand.evidenceRefs) } : {}), ...(strings(demand.forwardTo) ? { forwardTo: strings(demand.forwardTo) } : {}) });
  }

  const known = new Set(['schemaVersion', 'verificationMethod', 'safetyClass', 'rationale', 'risks', 'demands']);
  const unknown = Object.fromEntries(Object.entries(raw).filter(([key]) => !known.has(key)));
  return {
    ...(issues.length === 0 ? { metadata: { schemaVersion: 1, ...(verificationMethod ? { verificationMethod } : {}), ...(safetyClass ? { safetyClass } : {}), ...(nonEmpty(raw.rationale) ? { rationale: nonEmpty(raw.rationale) } : {}), risks, demands, _unknown: unknown } } : {}),
    issues,
  };
}

export function parseRequirementMetadataYaml(source: string): MetadataParseResult {
  try { return validateRequirementMetadata(parseYaml(source)); }
  catch (error) { return { issues: [{ code: 'FR_METADATA_INVALID', path: '$', message: `invalid YAML: ${(error as Error).message}` }] }; }
}

export function renderRequirementMetadata(metadata: RequirementMetadata): string {
  const { _unknown, ...known } = metadata;
  return stringifyYaml({ ...known, ..._unknown }, { lineWidth: 0 }).trim();
}
