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
import { scenarioKey } from './coverage.ts';
import type { AcNode, FrNode, NfrNode, ScenarioNode, SpecGraph } from './types.ts';

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
    return { scope: 'external-live', superseded_by: null };
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
    };
  }
  return { scope: 'active', superseded_by: null };
}

/** The graph view the classifier needs (ScenarioNode satisfies this). */
export interface ScenarioEvidenceInput {
  id: string;
  lastResult?: string;
  lastRunAt?: string;
  resultStale?: boolean;
  canonicalResult?: string;
  canonicalRunAt?: string;
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
  const source = s.trace?.source ?? null;
  const runId = s.trace?.runId ?? null;
  const stale = s.resultStale === true;
  const scopeDisposition = classifyScenarioScope(s.tags ?? []);
  const base = {
    scenario_key: key,
    scenario_id: s.id,
    run_id: runId,
    recency: { stale, canonical: false },
    scope: scopeDisposition.scope,
    superseded_by: scopeDisposition.superseded_by,
  };

  // 1) Canonical full-run evidence is the authoritative baseline. Overlay
  // freshness is retained as metadata, but stale canonical passes remain
  // execution debt — authority does not make evidence current again.
  if (s.canonicalResult) {
    const canonicalResult = s.canonicalResult.toUpperCase();
    return {
      ...base,
      outcome: canonicalResult === 'PASSED' && stale ? 'stale' : explicitOutcome(canonicalResult),
      result: canonicalResult,
      source: source ?? 'canonical-full-run',
      timestamp: s.canonicalRunAt ?? s.lastRunAt ?? null,
      recency: { stale, canonical: true },
      provenance: 'canonical-full-run',
    };
  }

  // 5) Never recorded by any run.
  if (!s.lastResult) {
    return {
      ...base,
      outcome: 'not_recorded',
      result: null,
      source: source,
      timestamp: s.lastRunAt ?? null,
      recency: { stale: false, canonical: false },
      provenance: source ? 'overlay' : 'none',
    };
  }

  const result = s.lastResult.toUpperCase();
  const at = s.lastRunAt ?? null;

  // 2) Untrusted provenance may not pass as execution success.
  if (source && /dependency[-_ ]?absent/i.test(source)) {
    return { ...base, outcome: 'UNKNOWN', result, source, timestamp: at, provenance: 'dependency-absent' };
  }
  if (source && /source[-_ ]?tree/i.test(source)) {
    return { ...base, outcome: 'UNKNOWN', result, source, timestamp: at, provenance: 'source-tree' };
  }

  // 3) Filtered-only proof — explicit, never a canonical pass.
  if (source && /filtered/i.test(source)) {
    return { ...base, outcome: 'filtered', result, source, timestamp: at, provenance: 'filtered-run' };
  }

  // 4) A pass older than the scenario/step-def source.
  if (result === 'PASSED' && stale) {
    return { ...base, outcome: 'stale', result, source, timestamp: at, provenance: 'overlay' };
  }

  return { ...base, outcome: explicitOutcome(result), result, source, timestamp: at, provenance: 'overlay' };
}

// ── Inventory (AC-63.1) ───────────────────────────────────────────────────

/** FR-level execution classification — the granularity buckets never had. */
export type FrExecutionClassification = 'never_run' | 'passed' | 'not_passed' | 'partial';

export interface FrInventoryEntry {
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

/**
 * Build the deduplicated FR/AC/scenario readiness inventory for ONE spec
 * from the shared graph snapshot. Deterministic (every list sorted) so all
 * four surfaces produce byte-identical projections (AC-63.1 «all three
 * surfaces SHALL report the same inventory»).
 */
export function buildReadinessInventory(graph: SpecGraph, opts: { spec: string }): ReadinessInventory {
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
      if (n.canonicalResult) sources.add('canonical-full-run');
      if (n.trace?.runId) runIds.add(n.trace.runId);
      if (n.trace?.source) sources.add(n.trace.source);
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
      if (scenario.lastResult === 'PASSED' && scenario.resultStale !== true) passedScenarioIds.add(e.to);
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
  const acSatisfied = acNodes.filter((ac) => !bulkSuspectAcIds.has(ac.id) && passedScenarioIds.has(ac.id) && acKeysById.has(ac.id)).length;
  const requiredNfrs = nfrNodes.filter((n) => n.metadata?.demands.some((d) => d.obligation === 'required'));
  const optionalNfrs = nfrNodes.filter((n) => n.metadata?.demands.every((d) => d.obligation !== 'required' && d.obligation !== 'not-applicable')).map((n) => localIdOf(n.id));
  const notApplicableNfrs = nfrNodes.filter((n) => n.metadata?.demands.some((d) => d.obligation === 'not-applicable')).map((n) => localIdOf(n.id));
  const nfrSatisfied = requiredNfrs.filter((n) => passedScenarioIds.has(n.id) && nfrKeysById.has(n.id)).length;
  const acDebt = acNodes.filter((ac) => bulkSuspectAcIds.has(ac.id) || !passedScenarioIds.has(ac.id) || !acKeysById.has(ac.id)).map((ac) => localIdOf(ac.id));
  const nfrDebt = requiredNfrs.filter((n) => !passedScenarioIds.has(n.id) || !nfrKeysById.has(n.id)).map((n) => localIdOf(n.id));
  const acStatus: SurfaceLaneStatus = acRequired > 0 && acSatisfied === acRequired ? 'GREEN' : 'RED';
  const nfrStatus: SurfaceLaneStatus = requiredNfrs.length === 0 || nfrSatisfied === requiredNfrs.length ? 'GREEN' : 'RED';

  return {
    spec: slug,
    ac_satisfaction: { status: acStatus, required: acRequired, satisfied: acSatisfied, debt: acDebt },
    nfr_satisfaction: { status: nfrStatus, required: requiredNfrs.length, satisfied: nfrSatisfied, optional: optionalNfrs, not_applicable: notApplicableNfrs, debt: nfrDebt },
    baseline: {
      graph_built_at: graph.builtAt,
      canonical_timestamp: canonicalTimestamp,
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
}

export interface ReadinessCandidate {
  inventory: ReadinessInventory;
  /**
   * Lanes the calling surface already computed over the SAME graph snapshot.
   * EXECUTION is ALWAYS derived from the inventory — a caller cannot supply
   * it (no surface may invent execution proof).
   */
  lanes?: Partial<Record<ReadinessLaneName, SurfaceLane>>;
}

export interface EvaluatedLane {
  status: SurfaceLaneStatus;
  blocking: boolean;
  debt: string[];
}

export interface ReadinessEvaluation {
  overall: 'READY' | 'NOT_READY';
  mandatory_lanes: readonly ReadinessLaneName[];
  lanes: Record<ReadinessLaneName, EvaluatedLane>;
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
  if (notRecorded > 0) debt.push(`SCENARIO_NOT_RUN:${notRecorded}`);
  if (neverRunFrs.length > 0) debt.push(`FR_NEVER_RUN:${neverRunFrs.join(',')}`);
  if (unprovenKeys.length > 0) debt.push(`HISTORICAL_UNPROVEN:${unprovenKeys.join(',')}`);
  for (const outcome of [...new Set(outcomes)]) {
    if (outcome === 'not_recorded' || outcome === 'PASSED') continue;
    debt.push(`${outcomes.filter((o) => o === outcome).length} ${outcome}`);
  }
  const status: SurfaceLaneStatus =
    debt.length === 0
      ? 'GREEN'
      // An unproven retirement claim is POSITIVE debt (a falsifiable marker),
      // not mere absence of evidence — it escalates past the never-run state.
      : unprovenKeys.length > 0
        ? 'RED'
        : outcomes.length > 0 && outcomes.every((o) => o === 'not_recorded')
          ? 'NOT_RUN'
          : 'RED';
  return { status, debt };
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
  const debt = live
    .filter((s) => s.outcome !== 'PASSED')
    .map((s) => `${s.scenario_key}:${s.outcome}`);
  return { status: debt.length === 0 ? 'GREEN' : 'RED', debt };
}

const LANE_NEXT_ACTION: Record<string, (e: ReadinessCandidate) => string> = {
  STRUCTURE: () => 'Fix structural/audit/conformance errors, then rerun the readiness check.',
  TRACEABILITY: () => 'Add the missing FR/AC/task/scenario traceability links, then rerun the readiness check.',
  EXECUTION: (c) => {
    const neverRun = c.inventory.frs
      .filter((fr) => fr.never_run
        && (fr.execution_scope === 'active' || fr.execution_scope === 'mixed' || fr.execution_scope === 'none'))
      .map((fr) => fr.id);
    return neverRun.length > 0
      ? `Run the full Docker BDD suite so canonical coverage records the never-run FR(s) ${neverRun.join(', ')} and every scenario result.`
      : 'Run the full Docker BDD suite so canonical coverage contains every scenario result.';
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
};

/**
 * AND-compose readiness over the mandatory lanes. Structural-only or
 * partially-discovered results stay NOT_READY: an unevaluated or
 * dependency-absent mandatory lane blocks exactly like a red one — no single
 * green lane may override absent evidence (FR-63).
 */
export function evaluateReadiness(candidate: ReadinessCandidate): ReadinessEvaluation {
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
    const blocking = MANDATORY_READINESS_LANES.includes(name)
      ? name === 'LIVE_EVIDENCE'
        // A spec WITHOUT live scenarios reports NONE — the lane is honest but
        // must not block; existing live scenarios without proof DO block.
        ? status === 'RED' || status === 'NOT_EVALUATED' || status === 'DEPENDENCY_ABSENT'
        : status !== 'GREEN'
      : name === 'SEMANTIC'
        ? status === 'RED' || status === 'DEPENDENCY_ABSENT'
        : false;
    lanes[name] = { status, blocking, debt };
  }
  const blockingLanes = MANDATORY_READINESS_LANES.filter((name) => lanes[name].blocking);
  const firstBlocking = blockingLanes.find((name) => lanes[name].status === 'DEPENDENCY_ABSENT')
    ?? blockingLanes.find((name) => name !== 'STRUCTURE')
    ?? blockingLanes[0];
  const overall: ReadinessEvaluation['overall'] = firstBlocking ? 'NOT_READY' : 'READY';
  const nextAction = !firstBlocking
    ? 'No readiness blockers detected by the shared inventory.'
    : lanes[firstBlocking].status === 'NOT_EVALUATED'
      ? `Evaluate the ${firstBlocking} lane — an unevaluated mandatory lane cannot certify readiness.`
      : lanes[firstBlocking].status === 'DEPENDENCY_ABSENT'
        ? `The ${firstBlocking} lane could not run for absent dependencies — dependency absence is not readiness proof (FR-64 scope).`
        : (LANE_NEXT_ACTION[firstBlocking]?.(candidate) ?? `Resolve ${firstBlocking} readiness debt, then rerun the readiness check.`);
  return {
    overall,
    mandatory_lanes: MANDATORY_READINESS_LANES,
    lanes,
    next_action: nextAction,
  };
}
