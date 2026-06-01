// spec-backlog types — shared between writer, classifier, resolvers, CLI.

export type BacklogCategory =
  | 'missing-spec-file'
  | 'missing-test'
  | 'ownership-conflict'
  | 'contradictory-nfr'
  | 'missing-fr-section'
  | 'dead-link-typo'
  | 'ambiguous-link'
  | 'missing-cross-ref'
  | 'deprecated-ref'
  | 'unrecognised';

export type BacklogStatus = 'open' | 'in-progress' | 'resolved' | 'wontfix';

export type BacklogDifficulty = 'easy' | 'medium' | 'hard';

export interface BacklogEntry {
  /** Stable id derived from sha256 of `(slug|code|evidence-key)` — first 12 hex chars. */
  id: string;
  ts: string;
  slug: string;
  /** The cross-spec-reconcile finding code that produced this entry. */
  code: string;
  category: BacklogCategory;
  evidence: {
    file?: string;
    line?: number;
    target?: string;
    occurrence_count?: number;
    label_samples?: string[];
    spec_a?: string;
    spec_b?: string;
    [k: string]: unknown;
  };
  suggested_resolver: string;
  difficulty: BacklogDifficulty;
  status: BacklogStatus;
  /** Set on `resolved` / `wontfix` transitions. */
  resolution?: {
    resolver: string;
    at: string;
    notes?: string;
    files_changed?: string[];
  };
}

export type Verdict = 'AUTO_FIX' | 'BACKLOG' | 'NOISE';

export interface ClassificationResult {
  verdict: Verdict;
  /** When BACKLOG. Required iff verdict === 'BACKLOG'. */
  entry?: Omit<BacklogEntry, 'id' | 'ts' | 'status'>;
  /** When NOISE. Hint to suggest detector tweak. */
  noiseReason?: string;
  /** When AUTO_FIX. Suggested rule name (informational). */
  autoFixRule?: string;
}
