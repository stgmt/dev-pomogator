/**
 * Axis enumeration from a PRD (FR-1). Three layers:
 *  L1 — BMAD 5-tier seed taxonomy (always considered)
 *  L2 — closed-list keyword grep over PRD text
 *  L3 — NEEDS CLARIFICATION marker harvest
 * Hard-OUT: brownfield signals (build-manifest mention / locked stack) → axes_detected=0.
 * Mirror structure of variant-matrix/trigger-phrases.ts (regex closed-list, no AST).
 */

export type Tier = 'Critical' | 'Important' | 'Deferred';
export type Category =
  | 'Data'
  | 'Auth-Security'
  | 'API-Communication'
  | 'Frontend'
  | 'Infra-Deployment'
  | 'Other';

export interface AxisCandidate {
  id: string;
  name: string;
  category: Category;
  tier: Tier;
  why_needed: string;
  evidence_quotes: string[];
}

export interface DetectResult {
  axes_detected: number;
  axes: AxisCandidate[];
  skipped_reason?: string;
}

// L1 — BMAD seed catalog (closed list) + the keywords that activate each axis (L2).
interface SeedAxis {
  id: string;
  name: string;
  category: Category;
  tier: Tier;
  keywords: RegExp;
  why_needed: string;
}

const SEED_AXES: SeedAxis[] = [
  { id: 'database', name: 'Database / persistence', category: 'Data', tier: 'Critical', why_needed: 'Persistent relational data must be stored', keywords: /\b(persist|relational|database|postgres|store[ds]?|records?|schema)\b/i },
  { id: 'file-storage', name: 'File storage', category: 'Data', tier: 'Important', why_needed: 'Raw files stored outside the database', keywords: /\b(file (storage|attachment)|attach(ment)?s?|upload|raw (csv|file|excel)|object storage|\bS3\b)\b/i },
  { id: 'auth', name: 'Authentication / access', category: 'Auth-Security', tier: 'Critical', why_needed: 'User login and data isolation', keywords: /\b(auth(entication|orization)?|log[ -]?in|sign[ -]?in|tenant|RLS|access control|isolation)\b/i },
  { id: 'api', name: 'HTTP API layer', category: 'API-Communication', tier: 'Critical', why_needed: 'Client talks to backend over an API', keywords: /\b(HTTP|REST|GraphQL|API|endpoint|webhook)\b/i },
  { id: 'frontend', name: 'Web frontend', category: 'Frontend', tier: 'Important', why_needed: 'User-facing dashboard / UI', keywords: /\b(frontend|front[ -]end|web client|dashboard|UI|SPA|web app)\b/i },
  { id: 'hosting', name: 'Hosting / deployment', category: 'Infra-Deployment', tier: 'Critical', why_needed: 'Where the system runs', keywords: /\b(deploy|hosting|server|managed service|infrastructure|cloud)\b/i },
  { id: 'background-jobs', name: 'Background jobs / scheduling', category: 'Infra-Deployment', tier: 'Important', why_needed: 'Scheduled / async work (cron, digests)', keywords: /\b(background job|cron|schedule[ds]?|daily digest|batch|queue|worker)\b/i },
  { id: 'email', name: 'Email channel', category: 'API-Communication', tier: 'Important', why_needed: 'Outbound/inbound email handling', keywords: /\b(e[ -]?mail|notification|digest|SMTP|inbound mail)\b/i },
  { id: 'llm', name: 'LLM / AI reasoning', category: 'Other', tier: 'Deferred', why_needed: 'AI-assisted feature', keywords: /\b(LLM|GPT|Claude|OpenRouter|AI[ -](model|reasoning)|classif)\b/i },
];

// Brownfield hard-OUT signals — stack already chosen / not being reconsidered.
const BROWNFIELD_SIGNALS: RegExp[] = [
  /\b(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|[A-Za-z0-9_.-]+\.csproj|requirements\.txt|build\.gradle|pom\.xml)\b/i,
  /\b(existing (stack|codebase)|stack (is )?(already )?(chosen|locked|fixed))\b/i,
  /\bnot being reconsidered\b/i,
  /\bdo not (introduce|change) (new )?(infrastructure|stack|hosting|database)\b/i,
];

function harvestNeedsClarification(content: string): AxisCandidate[] {
  const out: AxisCandidate[] = [];
  const re = /(?:NEEDS CLARIFICATION|\bTBD\b)[^\n.]*/gi;
  const matches = content.match(re) ?? [];
  for (const m of matches) {
    // only surface as an axis-candidate if it references a tech-choice noun
    if (/\b(LLM|model|provider|database|hosting|email|queue|storage|auth)\b/i.test(m)) {
      out.push({
        id: 'clarify-' + out.length,
        name: 'Needs clarification: ' + m.trim().slice(0, 60),
        category: 'Other',
        tier: 'Deferred',
        why_needed: 'PRD flagged this as an open tech decision',
        evidence_quotes: [m.trim()],
      });
    }
  }
  return out;
}

export function detectAxes(prdContent: string): DetectResult {
  // Hard-OUT: brownfield
  for (const sig of BROWNFIELD_SIGNALS) {
    const hit = prdContent.match(sig);
    if (hit) {
      return {
        axes_detected: 0,
        axes: [],
        skipped_reason: `brownfield-signals: matched "${hit[0]}"`,
      };
    }
  }

  const lines = prdContent.split('\n');
  const axes: AxisCandidate[] = [];

  for (const seed of SEED_AXES) {
    const evidence: string[] = [];
    for (const line of lines) {
      if (seed.keywords.test(line)) {
        evidence.push(line.trim());
        if (evidence.length >= 2) break;
      }
    }
    if (evidence.length > 0) {
      axes.push({
        id: seed.id,
        name: seed.name,
        category: seed.category,
        tier: seed.tier,
        why_needed: seed.why_needed,
        evidence_quotes: evidence,
      });
    }
  }

  // L3 — NEEDS CLARIFICATION (dedup against already-detected llm etc. is fine; они Deferred)
  for (const c of harvestNeedsClarification(prdContent)) {
    axes.push(c);
  }

  return { axes_detected: axes.length, axes };
}
