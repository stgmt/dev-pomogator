/**
 * SpecGraph in-memory model — TypeScript types per Entity 1 of v4 SCHEMA.md.
 *
 * The graph is a typed in-memory representation of a spec corpus: nodes of
 * 11 discriminated kinds (FR / NFR / AC / Decision / Story / Scenario / Task /
 * UseCase / Risk / File / StepBinding) connected by 8 edge kinds (refs / covers / tested-by /
 * tagged-by / implements / last-result / step-binding / code-impl). The MCP
 * server (Phase 2) serves slices of this graph; the builder (this Phase) is
 * the single producer.
 *
 * Map<id, Node> is used in memory (O(1) lookups, clean iteration) and
 * converted to a plain object on JSON serialisation. The on-disk shape in
 * SCHEMA.md uses `nodes: { id: Node }` literally — that's the persisted
 * form, not the in-process one.
 *
 * @see .specs/spec-generator-v4/FR.md FR-2 (SpecGraph builder)
 * @see .specs/spec-generator-v4/spec-generator-v4_SCHEMA.md Entity 1
 */

export type NodeType =
  | 'FR'
  | 'NFR'
  | 'AC'
  | 'Decision'
  | 'Story'
  | 'Scenario'
  | 'Task'
  | 'UseCase'
  | 'Risk'
  | 'File'
  | 'StepBinding';

export type EdgeType =
  | 'refs'
  | 'covers'
  | 'tested-by'
  | 'tagged-by'
  | 'implements'
  | 'last-result'
  | 'step-binding'
  | 'code-impl';

/** Shared shape every node carries. */
interface NodeBase {
  /**
   * Canonical id. For nodes inside `.specs/<slug>/` this is the FR-36a
   * spec-qualified composite key `<slug>:<localId>` (e.g.
   * `spec-generator-v4:FR-2`) — bare local ids collide across 47 specs and
   * silently drop ~90% of nodes. Files outside `.specs/` (e.g.
   * `tests/features/`) keep the bare local id.
   */
  id: string;
  /**
   * Owning spec slug derived from `.specs/<slug>/` (FR-36a). Absent for
   * files outside `.specs/`. When present, `id === \`${spec}:${localId}\``.
   */
  spec?: string;
  /** Source file (repository-relative POSIX path). */
  file: string;
  /** 1-indexed heading line in the source file. */
  line: number;
}

export interface FrNode extends NodeBase {
  type: 'FR';
  /** Heading title after `### FR-N:`, e.g. `Login`. */
  title: string;
  /** Optional YAML frontmatter merged from the parent file. */
  frontmatter?: Record<string, unknown>;
  /**
   * All anchor aliases that resolve to this heading. FR-3 mandates at least
   * the compact ID (`FR-001`) and the slug (`fr-001-login`); legacy v3
   * headings (`### Requirement: FR-001 Login`) add `requirement-fr-001-login`.
   */
  anchors: string[];
  /** Raw heading body text used for search and snippet rendering. */
  body: string;
}

export interface NfrNode extends NodeBase {
  type: 'NFR';
  /** Heading title, e.g. `SpecGraph cold start`. */
  title: string;
  /** Optional category, e.g. `Performance` / `Security` / `Reliability`. */
  category?: string;
  body: string;
  anchors: string[];
}

export interface AcNode extends NodeBase {
  type: 'AC';
  /** Parent FR id, parsed from the heading suffix `(FR-N)`. */
  parentFr: string;
  /** Raw EARS-format body (`WHEN ... THEN ... SHALL ...`). */
  ears: string;
}

export interface DecisionNode extends NodeBase {
  type: 'Decision';
  /** Heading title after `### Decision:`. */
  title: string;
  /**
   * Requirement id this decision is FOR — read from the block's
   * `**Requirement:** [FR-N]` / `**Требование:** [FR-N]` line (mirrors AcNode's
   * parentFr, parsed by parentFrAfter). Makes FR↔Decision a REAL graph edge, not
   * a text-scan of the body. Empty string when the block declares no requirement.
   */
  parentFr: string;
  /** Raw block body (Rationale / Trade-off / Alternatives). */
  body: string;
}

export interface StoryNode extends NodeBase {
  type: 'Story';
  /** Heading title after `### User Story N:`. */
  title: string;
  /**
   * Requirement id this story motivates — read from the block's
   * `**Требование:** [FR-N]` / `**Requirement:** [FR-N]` line (mirrors DecisionNode).
   * Makes FR↔Story a REAL graph edge, not a text-scan. Empty when undeclared.
   */
  parentFr: string;
  /** Raw block body (Why / Independent Test / Acceptance Scenarios). */
  body: string;
}

export interface ScenarioStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
}

export interface ScenarioFailingStep {
  step: string;
  errorMessage: string;
}

export interface ScenarioNode extends NodeBase {
  type: 'Scenario';
  tags: string[];
  pickleId?: string;
  steps: ScenarioStep[];
  lastResult?: 'PASSED' | 'FAILED' | 'SKIPPED' | 'PENDING' | 'UNDEFINED' | 'AMBIGUOUS' | 'UNKNOWN';
  /** ISO 8601 timestamp of the most recent run that produced `lastResult`. */
  lastRunAt?: string;
  durationMs?: number;
  failingStep?: ScenarioFailingStep | null;
}

export interface TaskNode extends NodeBase {
  type: 'Task';
  status: 'todo' | 'in-progress' | 'done' | 'blocked';
  /** FR/NFR ids the task implements. */
  refs: string[];
  /** Optional human title. */
  title?: string;
  /** The `## Phase …` heading this task sits under in TASKS.md (for list_phase_tasks). */
  phase?: string;
  /**
   * Full text of the task block (header + Done-When), so consumers can map the
   * task to scenarios via `SPECGEN004_NN` / `@featureN` mentions (FR-32). The
   * single source of truth shared by get_coverage and spec-status.
   */
  doneWhen?: string;
}

export interface UseCaseNode extends NodeBase {
  type: 'UseCase';
  title: string;
}

export interface RiskNode extends NodeBase {
  type: 'Risk';
  description: string;
  likelihood?: 'low' | 'medium' | 'high';
  impact?: 'low' | 'medium' | 'high';
  mitigation?: string;
}

export interface FileNode extends NodeBase {
  type: 'File';
  /** Path referenced in FILE_CHANGES.md or DESIGN.md. */
  path: string;
}

export interface StepBindingNode extends NodeBase {
  type: 'StepBinding';
  /** Code file referenced by the Gherkin step binding (e.g. `AuthSteps.cs`). */
  codeFile: string;
  /** 1-indexed line where the step binding is declared. */
  codeLine: number;
}

export type Node =
  | FrNode
  | NfrNode
  | AcNode
  | DecisionNode
  | StoryNode
  | ScenarioNode
  | TaskNode
  | UseCaseNode
  | RiskNode
  | FileNode
  | StepBindingNode;

/**
 * Optional metadata attached to specific edge kinds.
 *
 * Currently used by `implements` edges (FR-29) — every implements edge carries
 * the repo-relative file path, the source section that established the
 * linkage (`FILE_CHANGES` table row, or `DESIGN` "App-код" / "Где код"
 * section), and (when available) the FILE_CHANGES action verb. Other edge
 * kinds may extend this shape in later phases; the field stays optional so
 * existing edge-producers (md / gherkin / ndjson) remain untouched.
 */
export interface EdgeMetadata {
  /** Repo-relative POSIX path of the implemented file (implements edges). */
  file_path?: string;
  /** Which section of the spec established the linkage. */
  source_section?: 'FILE_CHANGES' | 'DESIGN';
  /** FILE_CHANGES action verb when sourced from a FILE_CHANGES row. */
  action?: 'create' | 'edit' | 'delete' | 'rename' | 'move' | 'replace';
}

export interface Edge {
  from: string;
  to: string;
  type: EdgeType;
  /** Edge-kind-specific metadata; currently populated for `implements`. */
  metadata?: EdgeMetadata;
}

export interface NodeLocation {
  file: string;
  line: number;
}

export interface BacklinkEntry {
  file: string;
  line: number;
  type: EdgeType;
}

export interface SpecGraph {
  /** Schema version (`1` for Phase 1..4; bumps gate by `meta.schema_version` in SQLite). */
  version: 1;
  /** ISO 8601 timestamp of the last full rebuild. */
  builtAt: string;
  /** Primary store: id → node. */
  nodes: Map<string, Node>;
  /** Append-only edge list. */
  edges: Edge[];
  /** Anchor index — every alias resolves to a single canonical location. */
  definitions: Map<string, NodeLocation>;
  /** Reverse index for fast «who links to me» queries. */
  backlinks: Map<string, BacklinkEntry[]>;
  /**
   * Raw PRE-MAP collision stats collected during the single build pass
   * (FR-36): every duplicate-id merge attempt the first-writer-wins dedup
   * would otherwise hide. Optional — set by `buildGraph`, absent on
   * hand-constructed graphs. Consumed by corpus-health (saves a second full
   * corpus parse); `collision-probe.ts` stays the INDEPENDENT cross-check
   * (separate code path = real verification, SPECGEN004_95).
   */
  rawCollisions?: {
    totalRawNodes: number;
    uniqueIds: number;
    collisions: Array<{ id: string; firstFile: string; secondFile: string }>;
  };
}

/**
 * Parser output shape — every parser (md / gherkin / ndjson) emits this
 * partial slice. The builder merges slices into the global SpecGraph.
 */
export interface ParserOutput {
  nodes: Node[];
  edges: Edge[];
  /** Aliases discovered in this slice; the builder validates uniqueness on merge. */
  anchors: Array<{ alias: string; canonicalId: string; location: NodeLocation }>;
}
