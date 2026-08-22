/**
 * FR-85 canonical requirement contract cards.
 *
 * This module owns one versioned contract model for FR-local metadata. It is
 * deliberately independent of RequirementMetadata to avoid a parser cycle;
 * metadata-schema.ts delegates nested `contract` validation here.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export const CONTRACT_CARD_VERSION = 1 as const;

export const CONTRACT_KINDS = [
  'cli',
  'api',
  'schema',
  'filesystem',
  'event',
  'state',
  'behavior',
  'disposition',
] as const;

export const CONTRACT_VERIFICATION_METHODS = [
  'bdd',
  'integration',
  'manual',
  'analysis',
  'demonstration',
] as const;

export const REQUIRED_EVIDENCE_KINDS = [
  'bdd',
  'integration',
  'implementation',
  'review',
  'analysis',
  'demonstration',
  'decision-record',
  'migration',
  'operational-proof',
] as const;

export const EVIDENCE_POLICY_SOURCES = ['canonical', 'planned', 'runtime', 'external'] as const;
export const EVIDENCE_POLICY_FRESHNESS = ['current', 'pending', 'stale', 'unknown'] as const;

export type ContractKind = typeof CONTRACT_KINDS[number];
export type ContractVerificationMethod = typeof CONTRACT_VERIFICATION_METHODS[number];
export type RequiredEvidenceKind = typeof REQUIRED_EVIDENCE_KINDS[number];
export type EvidencePolicySource = typeof EVIDENCE_POLICY_SOURCES[number];
export type EvidencePolicyFreshness = typeof EVIDENCE_POLICY_FRESHNESS[number];

export interface ContractObservable {
  when: string;
  then: string;
}

export interface ContractVerification {
  method: ContractVerificationMethod;
  required_evidence: RequiredEvidenceKind[];
  scenario: { refs: string[] } | { pending: true; reason: string };
  implementation_surface: { refs: string[] } | { unknown: true; reason: string };
  evidence_policy: {
    source: EvidencePolicySource;
    freshness: EvidencePolicyFreshness;
    independent: boolean;
  };
}

export interface RequirementContract {
  version: typeof CONTRACT_CARD_VERSION;
  kind: ContractKind;
  subject: string;
  preconditions?: string[];
  observables: ContractObservable[];
  negative_cases: ContractObservable[];
  invariants?: string[];
  verification: ContractVerification;
  [key: string]: unknown;
}

export type ContractIssueCode =
  | 'FR_CONTRACT_MISSING'
  | 'FR_CONTRACT_VERSION_UNSUPPORTED'
  | 'FR_CONTRACT_KIND_INVALID'
  | 'FR_CONTRACT_SUBJECT_MISSING'
  | 'FR_CONTRACT_OBSERVABLE_MISSING'
  | 'FR_CONTRACT_NEGATIVE_CASE_MISSING'
  | 'FR_CONTRACT_VERIFICATION_INVALID'
  | 'FR_CONTRACT_KIND_FIELDS_MISSING'
  | 'FR_CONTRACT_DISPOSITION_INVALID';

export interface ContractIssue {
  code: ContractIssueCode;
  path: string;
  message: string;
}

export interface ContractParseResult {
  contract?: RequirementContract;
  issues: ContractIssue[];
}

type RawObject = Record<string, unknown>;

function objectOf(value: unknown): RawObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RawObject
    : null;
}

function isPlaceholderText(value: string): boolean {
  return /^\{[^}]+\}$/.test(value)
    || /^\[[^\]]+\]$/.test(value)
    || /^(?:TBD|TODO|FIXME|NEEDS_CLARIFICATION)$/i.test(value);
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const candidate = value.trim();
  return candidate && !isPlaceholderText(candidate) ? candidate : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.map((item) => text(item));
  return values.every((item): item is string => Boolean(item))
    ? values
    : undefined;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? value as T[number]
    : undefined;
}

function addIssue(issues: ContractIssue[], code: ContractIssueCode, path: string, message: string): void {
  issues.push({ code, path, message });
}

function requiredObject(raw: RawObject, key: string, issues: ContractIssue[], code: ContractIssueCode = 'FR_CONTRACT_KIND_FIELDS_MISSING'): RawObject | undefined {
  const value = objectOf(raw[key]);
  if (!value || Object.keys(value).length === 0) addIssue(issues, code, key, `${key} must be a non-empty object`);
  return value && Object.keys(value).length > 0 ? value : undefined;
}

function requiredString(raw: RawObject, key: string, issues: ContractIssue[], code: ContractIssueCode = 'FR_CONTRACT_KIND_FIELDS_MISSING'): string | undefined {
  const value = text(raw[key]);
  if (!value) addIssue(issues, code, key, `${key} must be a non-empty string`);
  return value;
}

function requiredStringArray(raw: RawObject, key: string, issues: ContractIssue[], code: ContractIssueCode = 'FR_CONTRACT_KIND_FIELDS_MISSING'): string[] | undefined {
  const value = stringArray(raw[key]);
  if (!value || value.length === 0) addIssue(issues, code, key, `${key} must be a non-empty string array`);
  return value;
}

function validateObservableArray(value: unknown, path: string, issues: ContractIssue[], missingCode: ContractIssueCode): ContractObservable[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, missingCode, path, `${path} must contain at least one item`);
    return undefined;
  }
  const result: ContractObservable[] = [];
  for (const [index, item] of value.entries()) {
    const object = objectOf(item);
    const when = text(object?.when);
    const then = text(object?.then);
    if (!object || !when || !then) {
      addIssue(issues, 'FR_CONTRACT_OBSERVABLE_MISSING', `${path}[${index}]`, 'observable requires non-empty when and then');
      continue;
    }
    result.push({ when, then });
  }
  return result;
}

function validateVerification(raw: RawObject, issues: ContractIssue[]): ContractVerification | undefined {
  const value = objectOf(raw.verification);
  if (!value) {
    addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification', 'verification must be an object');
    return undefined;
  }

  const method = enumValue(value.method, CONTRACT_VERIFICATION_METHODS);
  if (!method) addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.method', `must be one of ${CONTRACT_VERIFICATION_METHODS.join('|')}`);

  const requiredEvidence = stringArray(value.required_evidence);
  if (!requiredEvidence || requiredEvidence.length === 0 || requiredEvidence.some((item) => !enumValue(item, REQUIRED_EVIDENCE_KINDS))) {
    addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.required_evidence', `must contain values from ${REQUIRED_EVIDENCE_KINDS.join('|')}`);
  }

  const scenario = objectOf(value.scenario);
  const scenarioRefs = stringArray(scenario?.refs);
  const scenarioPending = scenario?.pending === true;
  const scenarioReason = text(scenario?.reason);
  if ((scenarioRefs?.length ?? 0) > 0 && scenarioPending) {
    addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.scenario', 'refs and pending are mutually exclusive');
  } else if (scenarioRefs?.length) {
    // Concrete refs are the implemented branch.
  } else if (!scenarioPending || !scenarioReason) {
    addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.scenario', 'requires non-empty refs or pending:true with reason');
  }

  const implementationSurface = objectOf(value.implementation_surface);
  const surfaceRefs = stringArray(implementationSurface?.refs);
  const surfaceUnknown = implementationSurface?.unknown === true;
  const surfaceReason = text(implementationSurface?.reason);
  if ((surfaceRefs?.length ?? 0) > 0 && surfaceUnknown) {
    addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.implementation_surface', 'refs and unknown are mutually exclusive');
  } else if (surfaceRefs?.length) {
    // Concrete refs are the implemented branch.
  } else if (!surfaceUnknown || !surfaceReason) {
    addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.implementation_surface', 'requires non-empty refs or unknown:true with reason');
  }

  const policy = objectOf(value.evidence_policy);
  const source = enumValue(policy?.source, EVIDENCE_POLICY_SOURCES);
  const freshness = enumValue(policy?.freshness, EVIDENCE_POLICY_FRESHNESS);
  if (!source) addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.evidence_policy.source', `must be one of ${EVIDENCE_POLICY_SOURCES.join('|')}`);
  if (!freshness) addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.evidence_policy.freshness', `must be one of ${EVIDENCE_POLICY_FRESHNESS.join('|')}`);
  if (typeof policy?.independent !== 'boolean') addIssue(issues, 'FR_CONTRACT_VERIFICATION_INVALID', 'verification.evidence_policy.independent', 'must be boolean');

  if (issues.some((issue) => issue.path.startsWith('verification.'))) return undefined;
  return {
    method: method!,
    required_evidence: requiredEvidence!.map((item) => enumValue(item, REQUIRED_EVIDENCE_KINDS)!),
    scenario: scenarioRefs?.length ? { refs: scenarioRefs } : { pending: true, reason: scenarioReason! },
    implementation_surface: surfaceRefs?.length ? { refs: surfaceRefs } : { unknown: true, reason: surfaceReason! },
    evidence_policy: { source: source!, freshness: freshness!, independent: policy!.independent as boolean },
  };
}

function validateFieldArray(value: unknown, path: string, issues: ContractIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', path, `${path} must be a non-empty field array`);
    return;
  }
  for (const [index, item] of value.entries()) {
    const fieldValue = objectOf(item);
    if (!text(fieldValue?.name) || !text(fieldValue?.type) || typeof fieldValue?.required !== 'boolean') {
      addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', `${path}[${index}]`, 'field requires name, type, and required');
    }
  }
}

function validateStringMap(value: unknown, path: string, issues: ContractIssue[]): void {
  const map = objectOf(value);
  if (!map || Object.keys(map).length === 0) {
    addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', path, `${path} must be a non-empty string map`);
    return;
  }
  for (const [key, item] of Object.entries(map)) {
    if (!key.trim() || !text(item)) addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', `${path}.${key}`, 'map values must be non-empty strings');
  }
}

function validateErrorArray(value: unknown, path: string, issues: ContractIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', path, `${path} must be a non-empty Error[]`);
    return;
  }
  for (const [index, item] of value.entries()) {
    const error = objectOf(item);
    if (!text(error?.code) || !text(error?.observable)) {
      addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', `${path}[${index}]`, 'error requires code and observable');
    }
  }
}

function validateStructuredArray(value: unknown, path: string, issues: ContractIssue[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', path, `${path} must be a non-empty structured array`);
    return;
  }
  for (const [index, item] of value.entries()) {
    const object = objectOf(item);
    if (!object || Object.keys(object).length === 0) {
      addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', `${path}[${index}]`, 'entry must be a non-empty object');
    }
  }
}

function requiredConfinedPath(value: unknown, pathName: string, issues: ContractIssue[]): void {
  const candidate = text(value);
  const segments = candidate?.split(/[\\/]+/) ?? [];
  const absolute = Boolean(candidate && (/^(?:[A-Za-z]:[\\/]|[\\/]{1,2}|~[\\/])/.test(candidate) || segments.includes('..')));
  if (!candidate || absolute) addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', pathName, `${pathName} must be a confined repository-relative path`);
}

function validateKindSpecific(raw: RawObject, kind: ContractKind, issues: ContractIssue[]): void {
  if (kind === 'disposition') {
    const disposition = requiredObject(raw, 'disposition', issues, 'FR_CONTRACT_DISPOSITION_INVALID');
    if (!disposition) return;
    requiredString(disposition, 'status', issues, 'FR_CONTRACT_DISPOSITION_INVALID');
    requiredString(disposition, 'rationale', issues, 'FR_CONTRACT_DISPOSITION_INVALID');
    requiredString(disposition, 'owner', issues, 'FR_CONTRACT_DISPOSITION_INVALID');
    const successor = text(disposition.successor);
    const boundary = text(disposition.boundary);
    if ((successor ? 1 : 0) + (boundary ? 1 : 0) !== 1) addIssue(issues, 'FR_CONTRACT_DISPOSITION_INVALID', 'disposition.successor|boundary', 'exactly one of successor or boundary is required');
    return;
  }

  if (kind === 'cli') {
    const command = requiredObject(raw, 'command', issues);
    if (command) { requiredString(command, 'executable', issues); requiredStringArray(command, 'args', issues); }
    validateFieldArray(raw.input, 'input', issues);
    requiredObject(raw, 'output', issues);
    validateStringMap(raw.exit_codes, 'exit_codes', issues);
    validateErrorArray(raw.errors, 'errors', issues);
    return;
  }

  if (kind === 'api') {
    const request = requiredObject(raw, 'request', issues);
    if (request && !text(request.method) && !text(request.tool)) addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', 'request.method|tool', 'request requires method or tool');
    if (request) validateFieldArray(request.input, 'request.input', issues);
    requiredObject(raw, 'response', issues);
    requiredObject(raw, 'authority', issues);
    validateErrorArray(raw.errors, 'errors', issues);
    return;
  }

  if (kind === 'schema') {
    const schema = requiredObject(raw, 'schema', issues);
    if (schema) { validateFieldArray(schema.fields, 'schema.fields', issues); requiredObject(schema, 'enums', issues); requiredStringArray(schema, 'forbidden', issues); }
    return;
  }

  if (kind === 'filesystem') {
    if (!Array.isArray(raw.artifacts) || raw.artifacts.length === 0) { addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', 'artifacts', 'artifacts must be a non-empty array'); return; }
    for (const [index, item] of raw.artifacts.entries()) {
      const artifact = objectOf(item);
      if (!artifact || Object.keys(artifact).length === 0) {
        addIssue(issues, 'FR_CONTRACT_KIND_FIELDS_MISSING', `artifacts[${index}]`, 'artifact must be a non-empty object');
        continue;
      }
      requiredConfinedPath(artifact.path, `artifacts[${index}].path`, issues);
      for (const key of ['action', 'owner', 'atomicity']) requiredString(artifact, key, issues);
      requiredObject(artifact, 'resulting_state', issues);
      requiredObject(artifact, 'rollback', issues);
      requiredObject(artifact, 'confinement', issues);
    }
    return;
  }
  if (kind === 'event') {
    const event = requiredObject(raw, 'event', issues);
    if (event) {
      for (const key of ['name', 'producer', 'ordering', 'retry', 'duplicate']) requiredString(event, key, issues);
      requiredObject(event, 'payload', issues);
      requiredStringArray(event, 'consumers', issues);
    }
    return;
  }

  if (kind === 'state') {
    const state = requiredObject(raw, 'state', issues);
    if (state) {
      requiredStringArray(state, 'states', issues);
      validateStructuredArray(state.transitions, 'state.transitions', issues);
      validateStructuredArray(state.guards, 'state.guards', issues);
      requiredStringArray(state, 'terminal_outcomes', issues);
    }
    return;
  }

  const behavior = requiredObject(raw, 'behavior', issues);
  if (behavior) { for (const key of ['actor', 'trigger']) requiredString(behavior, key, issues); requiredStringArray(behavior, 'preconditions', issues); requiredStringArray(behavior, 'observable_outcomes', issues); requiredStringArray(behavior, 'forbidden_outcomes', issues); }
}

export function validateRequirementContract(value: unknown): ContractParseResult {
  const issues: ContractIssue[] = [];
  const raw = objectOf(value);
  if (!raw) return { issues: [{ code: 'FR_CONTRACT_MISSING', path: 'contract', message: 'contract card must be an object' }] };

  if (raw.version !== CONTRACT_CARD_VERSION) addIssue(issues, 'FR_CONTRACT_VERSION_UNSUPPORTED', 'version', 'contract version must be 1');
  const kind = enumValue(raw.kind, CONTRACT_KINDS);
  if (!kind) addIssue(issues, 'FR_CONTRACT_KIND_INVALID', 'kind', `kind must be one of ${CONTRACT_KINDS.join('|')}`);
  const subject = text(raw.subject);
  if (!subject) addIssue(issues, 'FR_CONTRACT_SUBJECT_MISSING', 'subject', 'subject must be non-empty');

  const observables = validateObservableArray(raw.observables, 'observables', issues, 'FR_CONTRACT_OBSERVABLE_MISSING');
  const negativeCases = validateObservableArray(raw.negative_cases, 'negative_cases', issues, 'FR_CONTRACT_NEGATIVE_CASE_MISSING');
  const verification = validateVerification(raw, issues);
  if (kind) validateKindSpecific(raw, kind, issues);
  if (issues.length > 0 || !kind || !subject || !observables || !negativeCases || !verification) return { issues };

  const contract = canonicalizeRequirementContract({
    ...raw,
    version: CONTRACT_CARD_VERSION,
    kind,
    subject,
    observables,
    negative_cases: negativeCases,
    ...(verification ? { verification } : {}),
  });
  return { contract, issues: [] };
}

function stableClone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableClone);
  const object = objectOf(value);
  if (!object) return value;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, stableClone(object[key])]));
}

export function canonicalizeRequirementContract(value: RequirementContract | RawObject): RequirementContract {
  const raw = value as RawObject;
  const ordered: RawObject = {};
  for (const key of ['version', 'kind', 'subject', 'preconditions', 'observables', 'negative_cases', 'invariants', 'verification']) if (raw[key] !== undefined) ordered[key] = stableClone(raw[key]);
  for (const key of Object.keys(raw).filter((item) => !Object.keys(ordered).includes(item)).sort()) ordered[key] = stableClone(raw[key]);
  return ordered as RequirementContract;
}

export function canonicalRequirementContractJson(value: RequirementContract | RawObject): string {
  return JSON.stringify(canonicalizeRequirementContract(value));
}

export function renderRequirementContract(value: RequirementContract | RawObject): string {
  const checked = validateRequirementContract(value);
  if (!checked.contract) throw new Error(checked.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; '));
  return stringifyYaml(checked.contract, { lineWidth: 0 }).trim();
}

export function parseRequirementContractYaml(source: string): ContractParseResult {
  try {
    return validateRequirementContract(parseYaml(source));
  } catch (error) {
    return { issues: [{ code: 'FR_CONTRACT_VERIFICATION_INVALID', path: '$', message: `invalid contract YAML: ${(error as Error).message}` }] };
  }
}
