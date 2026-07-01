// create-spec Phase 1.5 complexity heuristic (FR-12, SPECGEN004_28).
//
// Decides whether the user prompt warrants the heavier
// `architecture-research-workflow` skill OR the lighter
// `research-workflow` skill. Pure function — no I/O — so the agent
// can call it inline and act on the verdict immediately.
//
// Matches when ANY of:
//   • RU/EN keyword in the prompt: "архитектур*", "rebuild", "v\d+",
//     "перепроектировать", "redesign", "rewrite", "replatform"
//   • ≥3 distinct component nouns mentioned (PascalCase words ≥4 chars)
//
// The `--research-done` recursion guard belongs to the live skill flow;
// this module only owns the «which skill should I call» decision.

// JS regex `\b` and `\w` only recognise ASCII. Cyrillic-aware boundary:
// the keyword must be surrounded by non-letter characters (or start/end of
// string) on both sides. Implemented via lookaround on `[^\p{L}]`.
const KEYWORD_PATTERNS: RegExp[] = [
  /(?<![\p{L}])архитектур\p{L}*/iu,
  /(?<![\p{L}])перепроектировать(?![\p{L}])/iu,
  /\brebuild\b/i,
  /\bredesign\b/i,
  /\brewrite\b/i,
  /\breplatform\b/i,
  /\bv\d+\b/i,
];

const COMPONENT_NOUN_RE = /\b[A-Z][a-z]{3,}(?:[A-Z][a-z]{2,}){0,3}\b/g;
const COMPONENT_THRESHOLD = 3;

export type Verdict =
  | 'use-architecture-research-workflow'
  | 'use-research-workflow';

export interface HeuristicResult {
  verdict: Verdict;
  /** Why we chose this verdict — surfaced to the agent + audit log. */
  reason: string;
  /** Distinct component nouns detected (for transparency). */
  components: string[];
  /** Keyword matches found in the prompt. */
  keywordHits: string[];
}

export function detectComplexity(prompt: string): HeuristicResult {
  const keywordHits: string[] = [];
  for (const re of KEYWORD_PATTERNS) {
    const m = prompt.match(re);
    if (m) keywordHits.push(m[0]);
  }
  const componentsSet = new Set<string>();
  let m: RegExpExecArray | null;
  COMPONENT_NOUN_RE.lastIndex = 0;
  while ((m = COMPONENT_NOUN_RE.exec(prompt)) !== null) {
    componentsSet.add(m[0]);
  }
  const components = [...componentsSet];

  if (keywordHits.length > 0) {
    return {
      verdict: 'use-architecture-research-workflow',
      reason: `matched ${keywordHits.length} architecture keyword(s): ${keywordHits.join(', ')}`,
      components,
      keywordHits,
    };
  }
  if (components.length >= COMPONENT_THRESHOLD) {
    return {
      verdict: 'use-architecture-research-workflow',
      reason: `detected ${components.length} component nouns (≥${COMPONENT_THRESHOLD} threshold): ${components.slice(0, 5).join(', ')}…`,
      components,
      keywordHits,
    };
  }
  return {
    verdict: 'use-research-workflow',
    reason: `no architecture keyword + ${components.length} component noun(s) (<${COMPONENT_THRESHOLD} threshold)`,
    components,
    keywordHits,
  };
}
