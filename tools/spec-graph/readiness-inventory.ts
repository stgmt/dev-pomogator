/**
 * FR-63 foundation — the ONE graph-derived readiness inventory shared by
 * `precheck.ts`, `spec-status`, the MCP `get_spec_status` surface and
 * `spec-verdict` (FR-63a shared discovery/recency, FR-63b provenance).
 *
 * Every surface used to assemble its own slice of truth (counts here,
 * scenario buckets there, filtered proof elsewhere) — this module is the
 * single producer of:
 *   - a DEDUPLICATED per-spec FR / AC / scenario inventory (AC-63.1: each
 *     canonical atom counted exactly once; duplicate rows surface as
 *     explicit `duplicates` candidates instead of silently doubling),
 *   - per-AC `test_paths` (the executable BDD paths discovered for the AC —
 *     honestly `[]` when nothing maps, never fabricated — AC-63.2),
 *   - an FR-level never-run classification (FR granularity the scenario
 *     buckets never had),
 *   - an evidence taxonomy PASSED / UNKNOWN / not_recorded / stale / filtered
 *     (+ explicit non-pass outcomes) that preserves source, run id,
 *     timestamp and recency on every record (AC-63.2), where filtered or
 *     dependency-absent proof can NEVER replace canonical full-run evidence,
 *   - a mandatory-lane AND evaluator (FR-61 taxonomy) so structural-only or
 *     partially-discovered results stay NOT_READY (FR-63 / AC-63.3).
 *
 * Pure: a SpecGraph goes in, data comes out. No I/O, no external runtime
 * deps — the dependency-absent packaging concern belongs to FR-64, and a
 * dependency-absent evidence source is classified here, never trusted.
 *
 * @see .specs/spec-generator-v4/FR.md FR-63 (a, b, c)
 * @see .specs/spec-generator-v4/ACCEPTANCE_CRITERIA.md AC-63.1..AC-63.3
 * @see ./coverage.ts (scenarioKey / specOf reuse — one mapping source)
 */

import { localIdOf } from './identity.ts';
import { scenarioKey, isLiveAttestedScenario, type TestQualityVerdict } from './coverage.ts';
import type {
  AcNode,
  ExecutionArtifactIngestion,
  FrNode,
  NfrNode,
  ScenarioNode,
  SpecGraph,
  TaskNode,
} from './types.ts';

// ── Evidence taxonomy (AC-63.2) ───────────────────────────────────────────

/**
 * The explicit evidence outcome of ONE canonical scenario. `PASSED` means a
 * canonical full-run pass; `filtered` means the newest proof comes ONLY from
 * a filtered run (no canonical pass behind it); `stale` means a pass older
 * than the scenario/step-def source; `not_recorded` means never run;
 * `UNKNOWN` means observed-but-unresolved (incl. dependency-absent and
 * source-tree-only proof, which may NOT masquerade as execution success).
 * Non-pass canonical outcomes stay explicit.
 */
export type EvidenceOutcome =
  | 'PASSED'
  | 'UNKNOWN'
  | 'not_recorded'
  | 'stale'
  | 'filtered'
  | 'FAILED'
  | 'PENDING'
  | 'UNDEFINED'
  | 'AMBIGUOUS'
  | 'SKIPPED';

/** Where the evidence came from — provenance the AND gate can reason about. */
export type EvidenceProvenance =
  | 'canonical-full-run'
  | 'pytest-bdd-report'
  | 'filtered-run'
  | 'overlay'
  | 'source-tree'
  | 'dependency-absent'
  | 'none';

/**
 * One serialized evidence record. Every provenance field is ALWAYS present
 * (null when genuinely absent) so no source/time/recency is discarded by
 * serialization (AC-63.2).
 */
export interface EvidenceRecord {
  /** Canonical scenario key (`specgen004_600`) — the dedup identity. */
  scenario_key: string;
  /** Composite node id of the scenario node the record was retained from. */
  scenario_id: string;
  outcome: EvidenceOutcome;
  /** Raw recorded result enum (null ⇒ never recorded). */
  result: string | null;
  /** Evidence source (docker-bdd:full / docker-bdd:filtered / canonical-full-run / …). */
  source: string | null;
  /** Run identity (overlay run id / trace run id) when one was recorded. */
  run_id: string | null;
  /** Source-time of the evidence (ISO 8601) when one was recorded. */
  timestamp: string | null;
  /** Recency: `stale` ⇒ a pass older than the source; `canonical` ⇒ backed by the full-run NDJSON. */
  recency: { stale: boolean; canonical: boolean };
  provenance: EvidenceProvenance;
  /**
   * Execution-ownership scope (FR-81a honesty): `active` runs in the canonical
   * suite; `historical-retired` keeps its evidence but is owned by a proven
   * successor spec; `historical-unproven` claims history without proof and
   * stays debt; `external-live` is proved by a separate live producer, never by
   * the canonical cucumber run.
   */
  scope: ScenarioScope;
  /** Successor spec slug for `@superseded-by-<slug>` (null when absent). */
  superseded_by: string | null;
  /** Owner-attested live verification (`@live-attested`) — auditable via the tag. */
  live_attested: boolean;
}

/** The execution-ownership classes one canonical scenario can carry. */
export type ScenarioScope =
  | 'active'
  | 'historical-retired'
  | 'historical-unproven'
  | 'external-live';

export interface ScenarioScopeDisposition {
  scope: ScenarioScope;
  superseded_by: string | null;
  /**
   * Owner attestation (`@live-attested`): the live requirement was verified
   * in a real session by the owner, without a machine-captured producer
   * manifest. Auditable via the tag itself — never an implicit waiver.
   */
  live_attested: boolean;
}

const SUPERSEDED_TAG_RE = /^@superseded-by-([a-z0-9][a-z0-9-]*)$/i;

/**
 * Classify one scenario's execution-ownership scope from its tags —
 * fail-closed: `@historical` alone is NOT retirement; a proven
 * `@superseded-by-<slug>` successor (a spec that exists in the graph when
 * `knownSpecs` is supplied) is required before active debt is released.
 */
export function classifyScenarioScope(
  tags: readonly string[],
  opts: { knownSpecs?: ReadonlySet<string> } = {},
): ScenarioScopeDisposition {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.includes('@live-evidence')) {
    return { scope: 'external-live', superseded_by: null, live_attested: lower.includes('@live-attested') };
  }
  if (lower.includes('@historical')) {
    let successor: string | null = null;
    for (const tag of tags) {
      const match = tag.match(SUPERSEDED_TAG_RE);
      if (match) {
        successor = match[1];
        break;
      }
    }
    const proven = successor !== null && (!opts.knownSpecs || opts.knownSpecs.has(successor));
    return {
      scope: proven ? 'historical-retired' : 'historical-unproven',
      superseded_by: successor,
      live_attested: false,
    };
  }
  return { scope: 'active', superseded_by: null, live_attested: false };
}

/** The graph view the classifier needs (ScenarioNode satisfies this). */
export interface ScenarioEvidenceInput {
  id: string;
  lastResult?: string;
  lastRunAt?: string;
  lastResultSource?: string;
  lastResultRunId?: string;
  resultStale?: boolean;
  canonicalResult?: string;
  canonicalRunAt?: string;
  canonicalRunId?: string;
  canonicalSource?: string;
  trace?: { runId?: string; source?: string };
  /** Gherkin tags — drive the execution-ownership scope classification. */
  tags?: readonly string[];
}

const OUTCOME_ENUM = new Set<string>([
  'PASSED',
  'FAILED',
  'SKIPPED',
  'PENDING',
  'UNDEFINED',
  'AMBIGUOUS',
  'UNKNOWN',
]);

function explicitOutcome(raw: string): EvidenceOutcome {
  const upper = raw.toUpperCase();
  return (OUTCOME_ENUM.has(upper) ? upper : 'UNKNOWN') as EvidenceOutcome;
}

/**
 * Classify ONE scenario's evidence into the taxonomy. Precedence is the
 * honesty contract:
 *   1. canonical full-run evidence WINS — a filtered/overlay row can never
 *      replace it (AC-63.2 «filtered proof cannot replace canonical»),
 *   2. dependency-absent / source-tree-only proof is `UNKNOWN`, NEVER a pass
 *      (FR-63b; the FR-64 boundary — dependency absence is not FR-63 success),
 *   3. filtered-only proof is `filtered`, not `PASSED`,
 *   4. a pass older than the source is `stale`,
 *   5. absence of any record is `not_recorded` (distinct from `undefined`).
 * Source, run id, timestamp and recency are preserved on every record.
 */
export function classifyEvidence(s: ScenarioEvidenceInput): EvidenceRecord {
  const key = scenarioKey(s.id) ?? s.id.toLowerCase();
  const effectiveSource = s.lastResultSource ?? s.trace?.source ?? null;
  const effectiveRunId = s.lastResultRunId ?? s.trace?.runId ?? null;
  const stale = s.resultStale === true;
  const scopeDisposition = classifyScenarioScope(s.tags ?? []);
  const base = {
    scenario_key: key,
    scenario_id: s.id,
    run_id: effectiveRunId,
    recency: { stale, canonical: false },
    scope: scopeDisposition.scope,
    superseded_by: scopeDisposition.superseded_by,
    live_attested: scopeDisposition.live_attested,
  };

  // 1) Canonical full-run evidence is the authoritative baseline. Overlay
  // freshness is retained as metadata, but stale canonical passes remain
  // execution debt — authority does not make evidence current again.
  if (s.canonicalResult) {
    const canonicalResult = s.canonicalResult.toUpperCase();
    const canonicalSource = s.canonicalSource ?? effectiveSource;
    const canonicalRunId = s.canonicalRunId ?? effectiveRunId;
    return {
      ...base,
      outcome: canonicalResult === 'PASSED' && stale ? 'stale' : explicitOutcome(canonicalResult),
      result: canonicalResult,
      run_id: canonicalRunId,
      source: canonicalSource ?? 'canonical-full-run',
      timestamp: s.canonicalRunAt ?? s.lastRunAt ?? null,
      recency: { stale, canonical: true },
      provenance: canonicalSource === 'pytest-bdd:cucumber-json' ? 'pytest-bdd-report' : 'canonical-full-run',
    };
  }

  // 5) Never recorded by any run.
  if (!s.lastResult) {
    return {
      ...base,
      outcome: 'not_recorded',
      result: null,
      source: effectiveSource,
      timestamp: s.lastRunAt ?? null,
      recency: { stale: false, canonical: false },
      provenance: effectiveSource ? 'overlay' : 'none',
    };
  }

  const result = s.lastResult.toUpperCase();
  const at = s.lastRunAt ?? null;

  // 2) Untrusted provenance may not pass as execution success.
  if (effectiveSource && /dependency[-_ ]?absent/i.test(effectiveSource)) {
    return { ...base, outcome: 'UNKNOWN', result, source: effectiveSource, timestamp: at, provenance: 'dependency-absent' };
  }
  if (effectiveSource && /source[-_ ]?tree/i.test(effectiveSource)) {
    return { ...base, outcome: 'UNKNOWN', result, source: effectiveSource, timestamp: at, provenance: 'source-tree' };
  }

  // 3) pytest-bdd's supported Cucumber JSON report is canonical per-scenario evidence.
  if (effectiveSource === 'pytest-bdd:cucumber-json') {
    return { ...base, outcome: explicitOutcome(result), result, source: effectiveSource, timestamp: at, provenance: 'pytest-bdd-report' };
  }

  // 4) Filtered-only proof — explicit, never a canonical pass.
  if (effectiveSource && /filtered/i.test(effectiveSource)) {
    return { ...base, outcome: 'filtered', result, source: effectiveSource, timestamp: at, provenance: 'filtered-run' };
  }

  // 5) A pass older than the scenario/step-def source.
  if (result === 'PASSED' && stale) {
    return { ...base, outcome: 'stale', result, source: effectiveSource, timestamp: at, provenance: 'overlay' };
  }

  return { ...base, outcome: explicitOutcome(result), result, source: effectiveSource, timestamp: at, provenance: 'overlay' };
}

// ── Inventory (AC-63.1) ───────────────────────────────────────────────────

/** Agent-facing requirement evidence state, derived only from this inventory. */
export type FrEvidenceState = 'untagged' | 'impl-only' | 'exercised' | 'verified';

/** Canonical execution status; unlike coverage `not_run`, this distinguishes input absence. */
export type FrCanonicalEvidenceState = 'NOT_INGESTED' | 'NOT_RUN' | 'PARTIAL' | 'VERIFIED';

export type FrEvidenceDemotionReason =
  | 'CANONICAL_ARTIFACT_NOT_INGESTED'
  | 'SCENARIO_NOT_RUN'
  | 'STALE_EVIDENCE'
  | 'NON_PASSING_EVIDENCE'
  | 'FILTERED_ONLY'
  | 'UNTRUSTED_PROVENANCE'
  | 'TEST_QUALITY_WEAK'
  | 'TEST_QUALITY_FAKE_POSITIVE_RISK';

export interface FrEvidenceProjection {
  evidence_state: FrEvidenceState;
  canonical_evidence_state: FrCanonicalEvidenceState;
  evidence_demotion_reasons: FrEvidenceDemotionReason[];
}

/** FR-level execution classification — the granularity buckets never had. */
export type FrExecutionClassification = 'never_run' | 'passed' | 'not_passed' | 'partial';

export interface FrInventoryEntry extends FrEvidenceProjection {
  /** Local id (`FR-1`). */
  id: string;
  /** Composite graph id (`<slug>:FR-1`). */
  composite_id: string;
  /** True when NO mapped scenario carries any recorded execution evidence. */
  never_run: boolean;
  classification: FrExecutionClassification;
  /** Which execution lane owns this FR's scenarios (scope rollup). */
  execution_scope: FrExecutionScope;
  /** Canonical scenario keys mapped to this FR (deduplicated). */
  scenario_keys: string[];
  /** Composite scenario node ids mapped to this FR. */
  scenario_ids: string[];
  /** Local AC ids covering this FR. */
  ac_ids: string[];
}

export interface AcInventoryEntry {
  /** Local id (`AC-1`). */
  id: string;
  composite_id: string;
  /** Local parent FR id (`FR-1`) — empty when the AC declares none. */
  parent_fr: string;
  /**
   * Executable BDD paths discovered for this AC (feature files of its mapped
   * scenarios, source + executable mirrors). HONESTLY `[]` when nothing maps
   * — never fabricated (AC-63.2 / AC-63.3).
   */
  test_paths: string[];
  scenario_keys: string[];
  scenario_ids: string[];
}

/** A duplicate inventory candidate detected and deduplicated (AC-63.1 uniqueness invariant). */
export interface InventoryDuplicate {
  kind: 'FR' | 'AC' | 'Scenario';
  /** Local id for FR/AC, canonical scenario key for Scenario duplicates. */
  key: string;
  /** Composite node ids involved. */
  ids: string[];
  /** Source files the collision was observed in (FR/AC graph collisions). */
  files?: string[];
}

export interface ReadinessInventory {
  spec: string;
  /** Canonical artifact truth, never synthesized from scenario coverage buckets. */
  artifacts: ExecutionArtifactIngestion[];
  /** Requirement-owned AC/NFR satisfaction, never inherited from parent context. */
  ac_satisfaction: { status: SurfaceLaneStatus; required: number; satisfied: number; debt: string[] };
  nfr_satisfaction: { status: SurfaceLaneStatus; required: number; satisfied: number; optional: string[]; not_applicable: string[]; debt: string[] };
  /** Baseline + run identity the evidence was read against (FR-63a). */
  baseline: {
    graph_built_at: string;
    /** Newest canonical full-run timestamp across the inventory (null ⇒ none). */
    canonical_timestamp: string | null;
    /** Observed run identities (overlay/trace run ids). */
    run_ids: string[];
    /** Observed evidence sources (incl. `canonical-full-run` when present). */
    sources: string[];
  };
  frs: FrInventoryEntry[];
  acs: AcInventoryEntry[];
  /** One record per CANONICAL scenario key (deduplicated). */
  scenarios: EvidenceRecord[];
  /** Execution-ownership rollup: how many scenarios are active/live/retired/unproven. */
  scenario_scope: {
    active: number;
    external_live: { count: number; keys: string[] };
    historical_retired: { count: number; by_successor: Record<string, string[]> };
    historical_unproven: { count: number; keys: string[] };
  };
  duplicates: InventoryDuplicate[];
  counts: { fr: number; ac: number; scenario: number };
}

interface ScenarioBundle {
  key: string;
  /** All nodes sharing the canonical key (source + executable mirrors). */
  nodes: ScenarioNode[];
  /** The node the evidence record is retained from. */
  primary: ScenarioNode;
  record: EvidenceRecord;
}

const NON_PASS_OUTCOMES = new Set<EvidenceOutcome>([
  'FAILED',
  'AMBIGUOUS',
  'UNDEFINED',
  'PENDING',
  'SKIPPED',
  'UNKNOWN',
]);

function classifyFr(outcomes: EvidenceOutcome[], scenarioCount: number): FrExecutionClassification {
  if (scenarioCount === 0 || outcomes.every((o) => o === 'not_recorded')) return 'never_run';
  if (outcomes.every((o) => o === 'PASSED')) return 'passed';
  if (outcomes.some((o) => NON_PASS_OUTCOMES.has(o))) return 'not_passed';
  return 'partial';
}

/** Which execution lane owns an FR's scenarios (scope rollup, fail-closed). */
export type FrExecutionScope = 'active' | 'live' | 'retired' | 'mixed' | 'none';

function frExecutionScope(scopes: readonly ScenarioScope[]): FrExecutionScope {
  if (scopes.length === 0) return 'none';
  const distinct = new Set(scopes);
  const only = (scope: ScenarioScope): boolean => distinct.size === 1 && distinct.has(scope);
  if (only('historical-retired')) return 'retired';
  if (only('external-live')) return 'live';
  if ([...distinct].every((s) => s === 'active' || s === 'historical-unproven')) return 'active';
  return 'mixed';
}

function projectFrEvidence(
  graph: SpecGraph,
  fr: FrNode,
  keys: readonly string[],
  bundles: ReadonlyMap<string, ScenarioBundle>,
  testQualityByTask: Readonly<Record<string, TestQualityVerdict>>,
): FrEvidenceProjection {
  const records = keys.map((key) => bundles.get(key)!.record);
  const canonicalArtifacts = graph.executionArtifacts?.filter((artifact) => artifact.canonical) ?? [];
  const canonicalIngested = canonicalArtifacts.some((artifact) => artifact.state === 'INGESTED');
  const canonicalPass = records.length > 0 && records.every(
    (record) => record.outcome === 'PASSED' && record.recency.canonical && !record.recency.stale,
  );
  const reasons = new Set<FrEvidenceDemotionReason>();
  if (!canonicalIngested) reasons.add('CANONICAL_ARTIFACT_NOT_INGESTED');
  if (records.some((record) => record.outcome === 'not_recorded')) reasons.add('SCENARIO_NOT_RUN');
  if (records.some((record) => record.outcome === 'stale' || record.recency.stale)) reasons.add('STALE_EVIDENCE');
  if (records.some((record) => record.outcome === 'filtered' || record.provenance === 'filtered-run')) reasons.add('FILTERED_ONLY');
  if (records.some((record) => record.provenance === 'dependency-absent' || record.provenance === 'source-tree')) {
    reasons.add('UNTRUSTED_PROVENANCE');
  }
  if (records.some((record) => record.outcome !== 'PASSED' && record.outcome !== 'not_recorded' && record.outcome !== 'stale' && record.outcome !== 'filtered')) {
    reasons.add('NON_PASSING_EVIDENCE');
  }
  // A task can use a bare local FR reference only inside its own spec. Without
  // this scope guard, a weak task in another spec with the same `FR-N` quietly
  // demotes this FR's evidence.
  const relevantTasks = [...graph.nodes.values()].filter(
    (node): node is TaskNode => node.type === 'Task' && node.spec === fr.spec && node.refs.some(
      (ref) => ref === fr.id || ref === localIdOf(fr.id) || `${fr.spec}:${ref}` === fr.id,
    ),
  );
  if (relevantTasks.some((task) => testQualityByTask[task.id] === 'WEAK')) reasons.add('TEST_QUALITY_WEAK');
  if (relevantTasks.some((task) => testQualityByTask[task.id] === 'FAKE-POSITIVE-RISK')) {
    reasons.add('TEST_QUALITY_FAKE_POSITIVE_RISK');
  }
  const qualityDemoted = reasons.has('TEST_QUALITY_WEAK') || reasons.has('TEST_QUALITY_FAKE_POSITIVE_RISK');
  const hasImplementation = graph.edges.some((edge) => edge.type === 'implements' && edge.from === fr.id);
  const canonical_evidence_state: FrCanonicalEvidenceState = !canonicalIngested
    ? 'NOT_INGESTED'
    : records.length === 0 || records.every((record) => !record.recency.canonical)
      ? 'NOT_RUN'
      : canonicalPass && !qualityDemoted
        ? 'VERIFIED'
        : 'PARTIAL';
  const evidence_state: FrEvidenceState = keys.length === 0
    ? hasImplementation ? 'impl-only' : 'untagged'
    : canonical_evidence_state === 'VERIFIED'
      ? 'verified'
      : 'exercised';
  return {
    evidence_state,
    canonical_evidence_state,
    evidence_demotion_reasons: [...reasons].sort(),
  };
}

/**
 * Build the deduplicated FR/AC/scenario readiness inventory for ONE spec
 * from the shared graph snapshot. Deterministic (every list sorted) so all
 * four surfaces produce byte-identical projections (AC-63.1 «all three
 * surfaces SHALL report the same inventory»).
 */
export function buildReadinessInventory(
  graph: SpecGraph,
  opts: { spec: string; testQualityByTask?: Readonly<Record<string, TestQualityVerdict>> },
): ReadinessInventory {
  const slug = opts.spec.replace(/\\/g, '/').replace(/^\.?\/?\.specs\//, '').replace(/\/+$/, '');
  const slugTail = slug.split('/').pop()!.toLowerCase();

  // ── FR + AC atoms of this spec (graph ids are structurally unique) ──
  const frNodes: FrNode[] = [];
  const nfrNodes: NfrNode[] = [];
  const acNodes: AcNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.spec !== slug) continue;
    if (node.type === 'FR') frNodes.push(node);
    else if (node.type === 'NFR') nfrNodes.push(node);
    else if (node.type === 'AC') acNodes.push(node);
  }
  frNodes.sort((a, b) => a.id.localeCompare(b.id));
  nfrNodes.sort((a, b) => a.id.localeCompare(b.id));
  acNodes.sort((a, b) => a.id.localeCompare(b.id));

  // ── Scenario bundles keyed by canonical scenario key (dedup identity) ──
  // Spec scenarios: nodes under .specs/<slug>/. Executable mirrors: slug-less
  // nodes outside .specs that share a key with a spec scenario or live in a
  // slug-named file (same convention as spec-verdict's executableScenarios).
  const specScenarios: ScenarioNode[] = [];
  const outsideScenarios: ScenarioNode[] = [];
  for (const node of graph.nodes.values()) {
    if (node.type !== 'Scenario') continue;
    const file = node.file.replace(/\\/g, '/');
    if (file.includes('/.tmp/') || file.includes('/archive/')) continue;
    if (node.spec === slug) specScenarios.push(node);
    else if (!node.spec && file.toLowerCase().includes(slugTail)) outsideScenarios.push(node);
  }
  const specKeys = new Set(specScenarios.map((s) => scenarioKey(s.id) ?? s.id.toLowerCase()));
  const bundles = new Map<string, ScenarioBundle>();
  const addNode = (node: ScenarioNode): void => {
    const key = scenarioKey(node.id) ?? node.id.toLowerCase();
    let bundle = bundles.get(key);
    if (!bundle) {
      bundle = { key, nodes: [], primary: node, record: classifyEvidence(node) };
      bundles.set(key, bundle);
    }
    bundle.nodes.push(node);
  };
  for (const s of specScenarios) addNode(s);
  for (const s of outsideScenarios) {
    const key = scenarioKey(s.id) ?? s.id.toLowerCase();
    if (bundles.has(key) || specKeys.has(key)) addNode(s);
  }
  // Every spec slug present in the graph — the retirement contract only
  // accepts a `@superseded-by-<slug>` successor that actually exists here
  // (fail-closed: a dangling successor keeps the scenario in active debt).
  const knownSpecs = new Set<string>();
  for (const node of graph.nodes.values()) {
    if (node.spec) knownSpecs.add(node.spec);
  }
  // Retain the most-informed node as primary: canonical evidence wins, then
  // any recorded evidence, then the .specs source node (stable sort order).
  for (const bundle of bundles.values()) {
    bundle.nodes.sort((a, b) => a.id.localeCompare(b.id));
    const informed = [...bundle.nodes].sort((a, b) => evidenceRank(b) - evidenceRank(a));
    bundle.primary = informed[0];
    // Scope is classified from the UNION of every node's tags: source and
    // executable mirrors may carry the retirement/live tags on either copy.
    const unionTags = [...new Set(bundle.nodes.flatMap((node) => node.tags ?? []))];
    const scope = classifyScenarioScope(unionTags, { knownSpecs });
    bundle.record = {
      ...classifyEvidence(bundle.primary),
      scenario_key: bundle.key,
      scope: scope.scope,
      superseded_by: scope.superseded_by,
      live_attested: scope.live_attested,
    };
  }

  // ── Requirement/AC → scenario keys via REAL tested-by edges (FR-68/69) ──
  // Keep separate maps: an AC owns only its own tagged scenarios; parent-FR
  // scenarios are not inherited proof. NFRs follow the same ownership rule.
  const frKeysById = new Map<string, Set<string>>();
  const acKeysById = new Map<string, Set<string>>();
  const acFallbackKeysById = new Map<string, Set<string>>();
  const nfrKeysById = new Map<string, Set<string>>();
  for (const e of graph.edges) {
    if (e.type !== 'tested-by') continue;
    const key = scenarioKey(e.to) ?? e.to.toLowerCase();
    if (!bundles.has(key)) continue;
    const from = graph.nodes.get(e.from);
    if (!from || from.spec !== slug) continue;
    const target = from.type === 'FR' ? frKeysById : from.type === 'AC' ? acKeysById : from.type === 'NFR' ? nfrKeysById : null;
    if (!target) continue;
    const set = target.get(e.from) ?? new Set<string>();
    set.add(key);
    target.set(e.from, set);
  }
  // Legacy @featureN fixtures predate AC-owned tags. Preserve their inventory
  // visibility without treating parent-FR evidence as AC satisfaction: the
  // fallback only contributes scenario/test-path projection, never own proof.
  for (const ac of acNodes) {
    if ((acKeysById.get(ac.id)?.size ?? 0) > 0) continue;
    const parentId = ac.parentFr.includes(':') ? ac.parentFr : `${slug}:${ac.parentFr}`;
    const parentKeys = frKeysById.get(parentId);
    const legacyFeatureOnly = parentKeys && [...parentKeys].every((key) => bundles.get(key)?.nodes.every((node) => !node.tags.some((tag) => tag.startsWith('@AC-'))));
    if (parentKeys?.size && legacyFeatureOnly) acFallbackKeysById.set(ac.id, new Set(parentKeys));
  }

  // ── Duplicate candidates (AC-63.1 uniqueness invariant) ──
  const duplicates: InventoryDuplicate[] = [];
  for (const collision of graph.rawCollisions?.collisions ?? []) {
    if (!collision.id.startsWith(`${slug}:`)) continue;
    const local = localIdOf(collision.id);
    const kind: InventoryDuplicate['kind'] | null = local.startsWith('FR-')
      ? 'FR'
      : local.startsWith('AC-')
        ? 'AC'
        : null;
    if (!kind) continue;
    duplicates.push({
      kind,
      key: local,
      ids: [collision.id],
      files: [collision.firstFile, collision.secondFile],
    });
  }
  for (const bundle of bundles.values()) {
    if (bundle.nodes.length > 1) {
      duplicates.push({
        kind: 'Scenario',
        key: bundle.key,
        ids: bundle.nodes.map((n) => n.id).sort(),
      });
    }
  }
  duplicates.sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));

  // ── FR entries ──
  const acIdsByFr = new Map<string, string[]>();
  for (const ac of acNodes) {
    if (!ac.parentFr) continue;
    const arr = acIdsByFr.get(ac.parentFr) ?? [];
    arr.push(localIdOf(ac.id));
    acIdsByFr.set(ac.parentFr, arr);
  }
  const frs: FrInventoryEntry[] = frNodes.map((fr) => {
    const keys = [...(frKeysById.get(fr.id) ?? [])].sort();
    const outcomes = keys.map((k) => bundles.get(k)!.record.outcome);
    const classification = classifyFr(outcomes, keys.length);
    const scopes = keys.map((k) => bundles.get(k)!.record.scope);
    return {
      ...projectFrEvidence(graph, fr, keys, bundles, opts.testQualityByTask ?? {}),
      id: localIdOf(fr.id),
      composite_id: fr.id,
      never_run: classification === 'never_run',
      classification,
      execution_scope: frExecutionScope(scopes),
      scenario_keys: keys,
      scenario_ids: keys.flatMap((k) => bundles.get(k)!.nodes.map((n) => n.id)).sort(),
      ac_ids: [...(acIdsByFr.get(fr.id) ?? [])].sort(),
    };
  });

  // ── AC entries: each AC maps only to its own scenarios ──
  const acs: AcInventoryEntry[] = acNodes.map((ac) => {
    const ownKeys = acKeysById.get(ac.id);
    const keys = [...(ownKeys ?? (acNodes.length === 1 ? acFallbackKeysById.get(ac.id) : undefined) ?? [])].sort();
    const testPaths = new Set<string>();
    for (const k of keys) for (const n of bundles.get(k)!.nodes) testPaths.add(n.file.replace(/\\/g, '/'));
    return {
      id: localIdOf(ac.id),
      composite_id: ac.id,
      parent_fr: ac.parentFr ? localIdOf(ac.parentFr) : '',
      test_paths: [...testPaths].sort(),
      scenario_keys: keys,
      scenario_ids: keys.flatMap((k) => bundles.get(k)!.nodes.map((n) => n.id)).sort(),
    };
  });

  // ── Baseline + run identity (FR-63a) ──
  let canonicalTimestamp: string | null = null;
  const runIds = new Set<string>();
  const sources = new Set<string>();
  for (const bundle of bundles.values()) {
    for (const n of bundle.nodes) {
      if (n.canonicalRunAt && (!canonicalTimestamp || n.canonicalRunAt > canonicalTimestamp)) {
        canonicalTimestamp = n.canonicalRunAt;
      }
      if (n.canonicalResult && (!n.canonicalSource || n.canonicalSource !== 'pytest-bdd:cucumber-json')) sources.add('canonical-full-run');
      if (n.canonicalRunId) runIds.add(n.canonicalRunId);
      if (n.canonicalSource) sources.add(n.canonicalSource);
    }
  }

  const scenarios = [...bundles.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => b.record);

  const passedScenarioIds = new Set<string>();
  for (const e of graph.edges) {
    if (e.type !== 'verifies') continue;
    const source = graph.nodes.get(e.from);
    const target = graph.nodes.get(e.to);
    if (source?.type === 'Scenario' && target && (target.type === 'FR' || target.type === 'NFR' || target.type === 'AC')) {
      const scenario = source as ScenarioNode;
      const key = scenarioKey(scenario.id) ?? scenario.id.toLowerCase();
      const evidence = bundles.get(key)?.record ?? classifyEvidence(scenario);
      // Owner-attested live scenarios (@live-evidence @live-attested) count as
      // passing proof for AC/NFR/FR satisfaction exactly like a PASSED result —
      // the attestation is explicit and auditable, never an implicit waiver.
      const attested = isLiveAttestedScenario(scenario.tags);
      if ((evidence.outcome === 'PASSED' && evidence.recency.stale !== true) || attested) passedScenarioIds.add(e.to);
    }
  }
  const acRequired = acNodes.length;
  const bulkSuspectAcIds = new Set<string>();
  for (const ac of acNodes) {
    const keys = acKeysById.get(ac.id);
    if (!keys || keys.size < 10) continue;
    const signatures = new Set([...keys].map((key) => bundles.get(key)?.nodes.flatMap((node) => node.tags).filter((tag) => tag.startsWith('@AC-')).sort().join('|') ?? ''));
    if (signatures.size === 1) bulkSuspectAcIds.add(ac.id);
  }
  // FR-68: an AC is evaluated from its OWN tested-by evidence. The graph's
  // `verifies` edges never target ACs by construction (EDGE_SCHEMA: FR/NFR are
  // the only legal verifies targets), so AC satisfaction is computed from the
  // AC's own tagged scenarios (tested-by ownership — never inherited from the
  // parent FR) and their current outcomes: a fresh PASSED result, or an
  // explicit owner attestation, for EVERY owned scenario.
  const acOwnProofPasses = (acId: string): boolean => {
    const keys = acKeysById.get(acId);
    if (!keys || keys.size === 0) return false;
    return [...keys].every((key) => {
      const record = bundles.get(key)?.record;
      if (!record) return false;
      return record.outcome === 'PASSED' || record.live_attested;
    });
  };
  const acSatisfied = acNodes.filter((ac) => !bulkSuspectAcIds.has(ac.id) && acOwnProofPasses(ac.id)).length;
  const requiredNfrs = nfrNodes.filter((n) => n.metadata?.demands.some((d) => d.obligation === 'required'));
  const optionalNfrs = nfrNodes.filter((n) => n.metadata?.demands.every((d) => d.obligation !== 'required' && d.obligation !== 'not-applicable')).map((n) => localIdOf(n.id));
  const notApplicableNfrs = nfrNodes.filter((n) => n.metadata?.demands.some((d) => d.obligation === 'not-applicable')).map((n) => localIdOf(n.id));
  const nfrSatisfied = requiredNfrs.filter((n) => passedScenarioIds.has(n.id) && nfrKeysById.has(n.id)).length;
  const acDebt = acNodes.filter((ac) => bulkSuspectAcIds.has(ac.id) || !acOwnProofPasses(ac.id)).map((ac) => localIdOf(ac.id));
  const nfrDebt = requiredNfrs.filter((n) => !passedScenarioIds.has(n.id) || !nfrKeysById.has(n.id)).map((n) => localIdOf(n.id));
  const acStatus: SurfaceLaneStatus = acRequired > 0 && acSatisfied === acRequired ? 'GREEN' : 'RED';
  const nfrStatus: SurfaceLaneStatus = requiredNfrs.length === 0 || nfrSatisfied === requiredNfrs.length ? 'GREEN' : 'RED';

  return {
    spec: slug,
    artifacts: [...(graph.executionArtifacts ?? [])].sort((a, b) => a.kind.localeCompare(b.kind)),
    ac_satisfaction: { status: acStatus, required: acRequired, satisfied: acSatisfied, debt: acDebt },
    nfr_satisfaction: { status: nfrStatus, required: requiredNfrs.length, satisfied: nfrSatisfied, optional: optionalNfrs, not_applicable: notApplicableNfrs, debt: nfrDebt },
    baseline: {
      graph_built_at: graph.builtAt,
      canonical_timestamp: canonicalTimestamp ?? scenarios
        .map((scenario) => scenario.timestamp)
        .filter((timestamp): timestamp is string => Boolean(timestamp))
        .sort()
        .at(-1) ?? null,
      run_ids: [...runIds].sort(),
      sources: [...sources].sort(),
    },
    frs,
    acs,
    scenarios,
    scenario_scope: scenarioScopeRollup(scenarios),
    duplicates,
    counts: { fr: frs.length, ac: acs.length, scenario: scenarios.length },
  };
}

/** Roll the per-scenario scope records up into the inventory-level summary. */
export function scenarioScopeRollup(scenarios: readonly EvidenceRecord[]): ReadinessInventory['scenario_scope'] {
  const liveKeys: string[] = [];
  const unprovenKeys: string[] = [];
  const bySuccessor: Record<string, string[]> = {};
  let active = 0;
  for (const record of scenarios) {
    if (record.scope === 'active') active += 1;
    else if (record.scope === 'external-live') liveKeys.push(record.scenario_key);
    else if (record.scope === 'historical-unproven') unprovenKeys.push(record.scenario_key);
    else if (record.scope === 'historical-retired') {
      const successor = record.superseded_by ?? '(unknown)';
      (bySuccessor[successor] ??= []).push(record.scenario_key);
    }
  }
  for (const keys of Object.values(bySuccessor)) keys.sort();
  return {
    active,
    external_live: { count: liveKeys.length, keys: liveKeys.sort() },
    historical_retired: {
      count: Object.values(bySuccessor).reduce((n, keys) => n + keys.length, 0),
      by_successor: bySuccessor,
    },
    historical_unproven: { count: unprovenKeys.length, keys: unprovenKeys.sort() },
  };
}

/** More-informed evidence ranks higher for primary retention. */
function evidenceRank(n: ScenarioNode): number {
  if (n.canonicalResult) return 3;
  if (n.lastResult) return 2;
  return n.spec ? 1 : 0;
}

// ── Mandatory-lane AND evaluator (FR-61 taxonomy, AC-63.3) ────────────────

export type ReadinessLaneName =
  | 'STRUCTURE'
  | 'CONTRACT'
  | 'TRACEABILITY'
  | 'EXECUTION'
  | 'LIVE_EVIDENCE'
  | 'TASK_TRUTH'
  | 'BDD_SYNC'
  | 'AC_SATISFACTION'
  | 'NFR_SATISFACTION'
  | 'SEMANTIC'
  | 'FILTERED_PROOF';

/**
 * Lanes the AND gate REQUIRES green before readiness. SEMANTIC may be
 * explicitly skipped; FILTERED_PROOF is informational — neither can block
 * readiness alone, and neither can grant it. LIVE_EVIDENCE blocks only when
 * live scenarios EXIST and lack proof (RED); a spec with none reports NONE
 * and is not blocked by the lane.
 */
export const MANDATORY_READINESS_LANES: readonly ReadinessLaneName[] = [
  'STRUCTURE',
  'CONTRACT',
  'TRACEABILITY',
  'EXECUTION',
  'LIVE_EVIDENCE',
  'TASK_TRUTH',
  'BDD_SYNC',
  'AC_SATISFACTION',
  'NFR_SATISFACTION',
];

export const OPTIONAL_READINESS_LANES: readonly ReadinessLaneName[] = ['SEMANTIC', 'FILTERED_PROOF'];

export const ALL_READINESS_LANES: readonly ReadinessLaneName[] = [
  ...MANDATORY_READINESS_LANES,
  ...OPTIONAL_READINESS_LANES,
];

/**
 * Surface-supplied lane state. `NOT_EVALUATED` = the surface could not check
 * the lane (blocks — absence of proof is not proof). `DEPENDENCY_ABSENT` =
 * the check could not run for missing dependencies (FR-64 scope; blocks —
 * never a success).
 */
export type SurfaceLaneStatus =
  | 'GREEN'
  | 'RED'
  | 'NOT_RUN'
  | 'SKIPPED'
  | 'NONE'
  | 'NOT_EVALUATED'
  | 'DEPENDENCY_ABSENT';

export interface SurfaceLane {
  status: SurfaceLaneStatus;
  debt?: string[];
  /** Number of affected graph atoms, distinct from the number of reason strings. */
  affected_count?: number;
}

export interface EvaluatedLane extends SurfaceLane {
  blocking: boolean;
}

export interface ReadinessCandidate {
  inventory: ReadinessInventory;
  /**
   * Lanes the calling surface already computed over the SAME graph snapshot.
   * EXECUTION is ALWAYS derived from the inventory — a caller cannot supply
   * it (no surface may invent execution proof).
   */
  lanes?: Partial<Record<ReadinessLaneName, SurfaceLane>>;
  /** Optional engine-owned mandatory-lane projection for legacy rollout policies. */
  mandatoryLanes?: readonly ReadinessLaneName[];
}

/**
 * One deterministic remediation group. `action_center` contains every lane
 * blocking readiness; callers can render the whole queue while legacy callers
 * retain `next_action` as this ordered list's first `action.message`.
 */
export interface ReadinessActionGroup {
  lane: ReadinessLaneName | 'MULTILAYER';
  status: SurfaceLaneStatus;
  /** Positive count even when the blocker is an absent evaluation/dependency. */
  count: number;
  /** Stable, serializable blocking reasons — never an omitted empty array. */
  reasons: string[];
  action: {
    code: 'EVALUATE_LANE' | 'RESTORE_DEPENDENCY' | 'RESOLVE_LANE_DEBT';
    message: string;
  };
}

export interface ReadinessEvaluation {
  overall: 'READY' | 'NOT_READY';
  mandatory_lanes: readonly ReadinessLaneName[];
  lanes: Record<ReadinessLaneName, EvaluatedLane>;
  /** Complete deterministic queue of every blocking readiness lane. */
  action_center: ReadinessActionGroup[];
  /** Compatibility projection of `action_center[0].action.message`. */
  next_action: string;
}

/** Derive the EXECUTION lane from the inventory — the only honest source. */
export function deriveExecutionLane(inventory: ReadinessInventory): SurfaceLane {
  // Scope-aware (FR-81a): proven retired scenarios keep their records for
  // audit but are NOT active debt — the successor owns execution; live
  // scenarios belong to the LIVE_EVIDENCE lane; `historical-unproven` stays
  // debt (fail-closed).
  const activeScenarios = inventory.scenarios.filter(
    (s) => s.scope === 'active' || s.scope === 'historical-unproven',
  );
  const outcomes = activeScenarios.map((s) => s.outcome);
  const notRecorded = outcomes.filter((o) => o === 'not_recorded').length;
  const neverRunFrs = inventory.frs
    .filter((fr) => fr.never_run
      && (fr.execution_scope === 'active' || fr.execution_scope === 'mixed' || fr.execution_scope === 'none'))
    .map((fr) => fr.id);
  const unprovenKeys = activeScenarios
    .filter((s) => s.scope === 'historical-unproven')
    .map((s) => s.scenario_key);
  const debt: string[] = [];
  if (notRecorded > 0) {
    const hasCanonicalPerScenarioEvidence = activeScenarios.some((scenario) =>
      scenario.provenance === 'canonical-full-run' || scenario.provenance === 'pytest-bdd-report');
    debt.push(hasCanonicalPerScenarioEvidence
      ? `SCENARIO_NOT_RUN:${notRecorded}`
      : `NO_CANONICAL_SCENARIO_EVIDENCE:${notRecorded}:no canonical per-scenario result evidence found`);
  }
  if (neverRunFrs.length > 0) debt.push(`FR_NEVER_RUN:${neverRunFrs.join(',')}`);
  if (unprovenKeys.length > 0) debt.push(`HISTORICAL_UNPROVEN:${unprovenKeys.join(',')}`);
  for (const outcome of [...new Set(outcomes)]) {
    if (outcome === 'not_recorded' || outcome === 'PASSED') continue;
    debt.push(`${outcomes.filter((o) => o === outcome).length} ${outcome}`);
  }
  const status: SurfaceLaneStatus =
    debt.length === 0
      ? 'GREEN'
      : unprovenKeys.length > 0
        ? 'RED'
        : outcomes.length > 0 && outcomes.every((outcome) => outcome === 'not_recorded')
          ? 'NOT_RUN'
          : 'RED';
  const affectedScenarioKeys = new Set(
    activeScenarios
      .filter((scenario) => scenario.outcome !== 'PASSED')
      .map((scenario) => scenario.scenario_key),
  );
  const unmappedNeverRunFrs = neverRunFrs.filter((frId) => !inventory.frs.some(
    (fr) => fr.id === frId && fr.scenario_keys.length > 0,
  ));
  return {
    status,
    debt,
    affected_count: affectedScenarioKeys.size + unmappedNeverRunFrs.length,
  };
}

/**
 * Derive the LIVE_EVIDENCE lane from `external-live` scenarios: they are
 * proved by a separate live producer (real session/manifest/trace), never by
 * the canonical cucumber run. A spec with no live scenarios reports NONE —
 * the lane exists but does not block. Any non-PASSED live scenario is debt.
 */
export function deriveLiveEvidenceLane(inventory: ReadinessInventory): SurfaceLane {
  const live = inventory.scenarios.filter((s) => s.scope === 'external-live');
  if (live.length === 0) return { status: 'NONE', debt: [] };
  // A live scenario is satisfied by a PASSED live-producer result OR by an
  // explicit owner attestation tag (`@live-attested`) — the attestation is
  // visible in the feature source, so the lane never greens silently.
  const debt = live
    .filter((s) => s.outcome !== 'PASSED' && !s.live_attested)
    .map((s) => `${s.scenario_key}:${s.outcome}`);
  return { status: debt.length === 0 ? 'GREEN' : 'RED', debt, affected_count: debt.length };
}

const LANE_NEXT_ACTION: Record<ReadinessLaneName, (e: ReadinessCandidate) => string> = {
  STRUCTURE: () => 'Fix structural/audit/conformance errors, then rerun the readiness check.',
  CONTRACT: () => 'Add or repair every typed FR-85 contract card, then rerun the readiness check.',
  TRACEABILITY: () => 'Add the missing FR/AC/task/scenario traceability links, then rerun the readiness check.',
  EXECUTION: (c) => {
    const neverRun = c.inventory.frs
      .filter((fr) => fr.never_run
        && (fr.execution_scope === 'active' || fr.execution_scope === 'mixed' || fr.execution_scope === 'none'))
      .map((fr) => fr.id);
    const noCanonicalEvidence = !c.inventory.scenarios.some((scenario) =>
      scenario.provenance === 'canonical-full-run' || scenario.provenance === 'pytest-bdd-report');
    if (noCanonicalEvidence) {
      return 'No canonical per-scenario result evidence found. Run Cucumber with the canonical message formatter or pytest-bdd with --cucumber-json .dev-pomogator/pytest-bdd-report.json, then rerun status.';
    }
    return neverRun.length > 0
      ? `Canonical evidence exists; bind or execute the genuinely not-run FR(s) ${neverRun.join(', ')} and their scenarios.`
      : 'Run the supported BDD suite so canonical coverage contains every scenario result.';
  },
  LIVE_EVIDENCE: (c) => {
    const live = c.inventory.scenario_scope.external_live.keys;
    return live.length > 0
      ? `Produce real live-evidence proof for scenario(s) ${live.join(', ')} via the live producer (manifest + trace + readback); a canonical cucumber run cannot close them.`
      : 'Produce real live-evidence proof for the external live scenarios via the live producer.';
  },
  TASK_TRUTH: () => 'Reopen/downgrade DONE-but-unverified tasks or provide canonical passed scenario evidence.',
  BDD_SYNC: () => 'Fix source/executable BDD sync drift or mark intentional EXEC_ONLY/OUT_OF_SCOPE/PENDING scenarios.',
  AC_SATISFACTION: () => 'Add current passing scenario evidence owned by every required acceptance criterion.',
  NFR_SATISFACTION: () => 'Add current method-appropriate evidence owned by every required non-functional requirement.',
  SEMANTIC: () => 'Resolve semantic drift or restore the unavailable semantic-check dependency, then rerun the readiness check.',
  FILTERED_PROOF: () => 'Attach or inspect filtered proof; it is informational and cannot replace canonical readiness evidence.',
};

function actionGroup(
  lane: ReadinessLaneName,
  evaluated: EvaluatedLane,
  candidate: ReadinessCandidate,
): ReadinessActionGroup {
  const action = evaluated.status === 'NOT_EVALUATED'
    ? {
        code: 'EVALUATE_LANE' as const,
        message: `Evaluate the ${lane} lane — an unevaluated mandatory lane cannot certify readiness.`,
      }
    : evaluated.status === 'DEPENDENCY_ABSENT'
      ? {
          code: 'RESTORE_DEPENDENCY' as const,
          message: `The ${lane} lane could not run for absent dependencies — dependency absence is not readiness proof (FR-64 scope).`,
        }
      : {
          code: 'RESOLVE_LANE_DEBT' as const,
          message: LANE_NEXT_ACTION[lane](candidate),
        };
  const reasons = evaluated.debt.length > 0
    ? [...evaluated.debt]
    : [`${lane}:${evaluated.status}`];
  return {
    lane,
    status: evaluated.status,
    count: evaluated.affected_count ?? reasons.length,
    reasons,
    action,
  };
}

/**
 * AND-compose readiness over the mandatory lanes. Structural-only or
 * partially-discovered results stay NOT_READY: an unevaluated or
 * dependency-absent mandatory lane blocks exactly like a red one — no single
 * green lane may override absent evidence (FR-63).
 */
export function evaluateReadiness(candidate: ReadinessCandidate): ReadinessEvaluation {
  const mandatoryLanes = candidate.mandatoryLanes ?? MANDATORY_READINESS_LANES;
  const execution = deriveExecutionLane(candidate.inventory);
  const liveEvidence = deriveLiveEvidenceLane(candidate.inventory);
  const lanes = {} as Record<ReadinessLaneName, EvaluatedLane>;
  for (const name of ALL_READINESS_LANES) {
    const supplied = name === 'EXECUTION'
      ? execution
      : name === 'LIVE_EVIDENCE'
        ? liveEvidence
        : name === 'AC_SATISFACTION'
          ? candidate.inventory.ac_satisfaction
          : name === 'NFR_SATISFACTION'
            ? candidate.inventory.nfr_satisfaction
            : candidate.lanes?.[name];
    const status: SurfaceLaneStatus = supplied?.status ?? 'NOT_EVALUATED';
    const debt = supplied?.debt ?? [];
    const blocking = mandatoryLanes.includes(name)
      ? name === 'LIVE_EVIDENCE'
        ? status === 'RED' || status === 'NOT_EVALUATED' || status === 'DEPENDENCY_ABSENT'
        : status !== 'GREEN'
      : name === 'SEMANTIC'
        ? status === 'RED' || status === 'DEPENDENCY_ABSENT'
        : false;
    lanes[name] = { status, blocking, debt };
  }
  const blockingLanes = ALL_READINESS_LANES.filter((name) => lanes[name].blocking);
  // Preserve the legacy first-action priority while making the whole blocker
  // queue deterministic and serializable for richer consumers.
  const firstBlocking = blockingLanes.find((name) => lanes[name].status === 'DEPENDENCY_ABSENT')
    ?? blockingLanes.find((name) => name !== 'STRUCTURE')
    ?? blockingLanes[0];
  const orderedBlockingLanes = firstBlocking
    ? [firstBlocking, ...blockingLanes.filter((name) => name !== firstBlocking)]
    : [];
  const actionCenter = orderedBlockingLanes.map((name) => actionGroup(name, lanes[name], candidate));
  const overall: ReadinessEvaluation['overall'] = actionCenter.length > 0 ? 'NOT_READY' : 'READY';
  return {
    overall,
    mandatory_lanes: mandatoryLanes,
    lanes,
    action_center: actionCenter,
    next_action: actionCenter[0]?.action.message ?? 'No readiness blockers detected by the shared inventory.',
  };
}
