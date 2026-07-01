// FR-11: predict `@FR-N` tags for UNTAGGED `.feature` scenarios via a naming/keyword
// heuristic (e.g. `Scenario: User logs in` → suggest `@FR-001` when FR-001 mentions "login").
//
// Pure: takes the feature source + an FR catalog, returns one suggestion per scenario. The CLI
// surfaces these in --suggest-only / interactive output; it NEVER auto-writes a tag (the v4
// migration is suggest-then-confirm). Already-tagged scenarios are reported with
// `alreadyTagged: true` and no suggestion, so the CLI can skip them.

export interface FrEntry {
  frId: string; // canonical "FR-001"
  title: string;
  body?: string;
}

export interface TagSuggestion {
  line: number; // 1-based line of the `Scenario:` / `Scenario Outline:`
  scenarioName: string;
  alreadyTagged: boolean;
  suggestedTag: string | null; // "@FR-001" or null when no confident match
  frId: string | null;
  score: number; // 0..1 overlap of scenario tokens matched against the FR
}

// Cross-language stopwords + Gherkin/role boilerplate that carry no signal.
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'as', 'is', 'are',
  'be', 'can', 'should', 'shall', 'when', 'then', 'given', 'user', 'system', 'scenario',
  'и', 'или', 'в', 'на', 'для', 'с', 'как', 'когда', 'тогда', 'если', 'должен', 'должна',
  'пользователь', 'система', 'сценарий',
]);

const TAG_LINE_RE = /^\s*@\S/;
const SCENARIO_RE = /^\s*Scenario(?:\s+Outline)?:\s*(.+?)\s*$/;

/** lowercase → split on non-word (Unicode) → drop stopwords + tokens shorter than 3. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

// Two tokens match if equal OR they share a >=3-char prefix — a cheap stem so "logs"
// matches "login" (shared "log"), "creates" matches "creation", "пополнение" matches
// "пополнить". tokenize already drops tokens shorter than 3, so the prefix is meaningful.
// Loose by design: this only powers a SUGGESTION the user confirms, never an auto-write.
function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  return a.slice(0, 3) === b.slice(0, 3);
}

/** Overlap score = (# scenario tokens that match ANY FR token) / (# scenario tokens). */
function scoreAgainst(scenarioTokens: string[], frTokens: Set<string>): number {
  if (scenarioTokens.length === 0) return 0;
  let hits = 0;
  for (const st of scenarioTokens) {
    for (const ft of frTokens) {
      if (tokenMatches(st, ft)) {
        hits++;
        break;
      }
    }
  }
  return hits / scenarioTokens.length;
}

export interface PredictOptions {
  /** Minimum overlap score to emit a suggestion. Default 0.34 (≈ 1 of 3 tokens). */
  threshold?: number;
}

/**
 * Predict a tag per scenario in `featureSource`. A scenario is "already tagged" when the
 * immediately preceding non-blank line is a Gherkin tag line (`@...`). Untagged scenarios
 * get the highest-scoring FR above the threshold, or `suggestedTag: null` if none clears it.
 */
export function predictTags(
  featureSource: string,
  frs: FrEntry[],
  opts: PredictOptions = {},
): TagSuggestion[] {
  const threshold = opts.threshold ?? 0.34;
  const frTokenSets = frs.map((fr) => ({
    fr,
    tokens: new Set(tokenize(`${fr.title} ${fr.body ?? ''}`)),
  }));

  const lines = featureSource.split(/\r?\n/);
  const out: TagSuggestion[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SCENARIO_RE);
    if (!m) continue;
    const scenarioName = m[1];

    // Look back over blank lines for a tag line.
    let alreadyTagged = false;
    for (let j = i - 1; j >= 0; j--) {
      if (lines[j].trim() === '') continue;
      alreadyTagged = TAG_LINE_RE.test(lines[j]);
      break;
    }

    if (alreadyTagged) {
      out.push({ line: i + 1, scenarioName, alreadyTagged: true, suggestedTag: null, frId: null, score: 0 });
      continue;
    }

    const scenTokens = tokenize(scenarioName);
    let best: { frId: string; score: number } | null = null;
    for (const { fr, tokens } of frTokenSets) {
      const s = scoreAgainst(scenTokens, tokens);
      if (s > 0 && (!best || s > best.score)) best = { frId: fr.frId, score: s };
    }
    const confident = best && best.score >= threshold ? best : null;
    out.push({
      line: i + 1,
      scenarioName,
      alreadyTagged: false,
      suggestedTag: confident ? `@${confident.frId}` : null,
      frId: confident ? confident.frId : null,
      score: confident ? Number(confident.score.toFixed(2)) : 0,
    });
  }
  return out;
}

const FR_HEADING_RE = /^#{1,6}\s+(?:Requirement:\s*)?FR-(\d+)[:\s]+(.+?)\s*$/;

/**
 * Extract an FR catalog (id + title + body until the next FR heading) from FR.md source.
 * Handles both v3 (`### Requirement: FR-N title`) and v4 (`## FR-N: title`) headings.
 */
export function extractFrs(frMarkdown: string): FrEntry[] {
  const lines = frMarkdown.split(/\r?\n/);
  const out: FrEntry[] = [];
  let cur: { frId: string; title: string; body: string[] } | null = null;
  const flush = () => {
    if (cur) out.push({ frId: cur.frId, title: cur.title, body: cur.body.join('\n').trim() });
  };
  for (const line of lines) {
    const m = line.match(FR_HEADING_RE);
    if (m) {
      flush();
      cur = { frId: `FR-${m[1]}`, title: m[2], body: [] };
    } else if (cur) {
      cur.body.push(line);
    }
  }
  flush();
  return out;
}

/** Render the tag-prediction summary for stdout (suggest-only / interactive preview). */
export function renderTagSuggestions(filePath: string, suggestions: TagSuggestion[]): string {
  const untagged = suggestions.filter((s) => !s.alreadyTagged);
  if (untagged.length === 0) return '';
  const lines: string[] = [`tag suggestions for ${filePath}:`];
  for (const s of untagged) {
    lines.push(
      s.suggestedTag
        ? `  line ${s.line}: "${s.scenarioName}" → ${s.suggestedTag} (score ${s.score})`
        : `  line ${s.line}: "${s.scenarioName}" → (no confident FR match)`,
    );
  }
  return lines.join('\n') + '\n';
}
