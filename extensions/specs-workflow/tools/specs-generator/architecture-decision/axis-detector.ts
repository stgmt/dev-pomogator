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
  | 'Networking'
  | 'Hardware'
  | 'Other';

export interface AxisCandidate {
  id: string;
  name: string;
  category: Category;
  tier: Tier;
  why_needed: string;
  evidence_quotes: string[];
  /** Distinct PRD lines matching this axis. high = ≥2 (confident); low = 1 (weak signal). */
  confidence: 'high' | 'low';
  match_count: number;
}

export interface DetectResult {
  axes_detected: number;
  axes: AxisCandidate[];
  skipped_reason?: string;
  /** Stack chosen in prose (no build manifest). Axes still enumerated; variant-picking moot,
   *  completeness layer (FR-12) still applies. */
  stack_locked?: boolean;
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
  { id: 'hosting', name: 'Hosting / deployment', category: 'Infra-Deployment', tier: 'Critical', why_needed: 'Where the system runs', keywords: /\b(deploy|hosting|server|managed services?|infrastructure|cloud|PaaS|serverless)\b/i },
  { id: 'background-jobs', name: 'Background jobs / scheduling', category: 'Infra-Deployment', tier: 'Important', why_needed: 'Scheduled / async work (cron, digests)', keywords: /\b(background job|cron|schedule[ds]?|daily digest|batch|queue|worker)\b/i },
  { id: 'email', name: 'Email channel', category: 'API-Communication', tier: 'Important', why_needed: 'Outbound/inbound email handling', keywords: /\b(e[ -]?mail|notification|digest|SMTP|inbound mail)\b/i },
  { id: 'llm', name: 'LLM / AI reasoning', category: 'Other', tier: 'Deferred', why_needed: 'AI-assisted feature', keywords: /\b(LLM|GPT|Claude|OpenRouter|AI[ -](model|reasoning)|classif)\b/i },
  // --- non-webapp domains (networking / hardware / messaging / devtools / data) ---
  { id: 'network-transport', name: 'Network transport / VPN protocol', category: 'Networking', tier: 'Critical', why_needed: 'How traffic is tunnelled/obfuscated', keywords: /\b(VPN|WireGuard|AmneziaWG|VLESS|OpenVPN|proxy|tunnel|обфускац|обход|туннел|transport protocol)\b/i },
  // NB: bare `DNS` / `routing` removed — they over-matched non-VPN PRDs ("scaffold infra (DNS, A2P)",
  // "Twilio number routing"). Require domain-qualified forms.
  { id: 'dns-resolution', name: 'DNS resolution / filtering', category: 'Networking', tier: 'Important', why_needed: 'Name resolution + ad/DPI filtering policy', keywords: /\b(DNS[ -](resolver|filtering|over|server|leak)|DoH|DoT|AdGuard|adblock|NextDNS|fakeip|DNS hijack|разрешение имён|DNS-фильтрац)\b/i },
  { id: 'routing-strategy', name: 'Routing strategy (split vs full tunnel)', category: 'Networking', tier: 'Critical', why_needed: 'Which traffic goes via VPN vs direct', keywords: /\b(split[ -]?tunnel|full[ -]?tunnel|split tunneling|traffic routing|маршрутизац|DPI bypass|Zapret|policy[ -]?routing)\b/i },
  { id: 'hardware-platform', name: 'Hardware / firmware platform', category: 'Hardware', tier: 'Critical', why_needed: 'Physical device + firmware/OS the system runs on', keywords: /\b(router|OpenWrt|OpenWRT|Keenetic|firmware|прошивк|SBC|Raspberry|ARM board|embedded|роутер|железо)\b/i },
  { id: 'messaging-channel', name: 'Messaging channel (SMS / voice / push)', category: 'API-Communication', tier: 'Important', why_needed: 'Non-email comms transport', keywords: /\b(SMS|voice call|push notification|Twilio|telephony|IVR|голосов|звонок|messaging channel)\b/i },
  { id: 'packaging-distribution', name: 'Packaging / distribution', category: 'Infra-Deployment', tier: 'Important', why_needed: 'How the artefact is built/shipped/installed', keywords: /\b(CLI|binary|package manager|npm publish|installer|distribution|release artifact|homebrew|apt|сборк|дистрибут)\b/i },
  { id: 'data-pipeline', name: 'Data pipeline / ingestion', category: 'Data', tier: 'Important', why_needed: 'Batch/stream data ingestion + transform', keywords: /\b(ETL|data pipeline|ingest|stream processing|Kafka|Airflow|batch job processing|конвейер данных|обработка потока)\b/i },
];

// Hard-OUT ONLY on a real build manifest (code already exists → true brownfield).
const MANIFEST_SIGNALS: RegExp[] = [
  /\b(package\.json|pyproject\.toml|Cargo\.toml|go\.mod|[A-Za-z0-9_.-]+\.csproj|requirements\.txt|build\.gradle|pom\.xml)\b/i,
];
// Stack decided in PROSE (no code yet). NOT a hard-OUT — axes are still enumerated so the
// completeness layer (FR-12) runs even when variant-picking is moot. Was a bug: locked-stack
// greenfield projects (e.g. bhph) skipped the whole skill incl. the completeness gate.
const STACK_LOCK_SIGNALS: RegExp[] = [
  /\b(existing (stack|codebase)|stack (is )?(already )?(chosen|locked|fixed))\b/i,
  /\bnot being reconsidered\b/i,
  /\bdo not (introduce|change) (new )?(infrastructure|stack|hosting|database)\b/i,
];

function harvestNeedsClarification(content: string): AxisCandidate[] {
  const out: AxisCandidate[] = [];
  // Marker and tech noun may appear in EITHER order on the line:
  //   "Which LLM … is NEEDS CLARIFICATION."  OR  "NEEDS CLARIFICATION: which LLM".
  // So test the whole line for both, not just the text after the marker.
  const markerRe = /NEEDS CLARIFICATION|\bTBD\b/i;
  const techRe = /\b(LLM|model|provider|database|hosting|email|queue|storage|auth)\b/i;
  for (const rawLine of content.split('\n')) {
    if (markerRe.test(rawLine) && techRe.test(rawLine)) {
      const text = rawLine.replace(/^[\s\-*>\d.]+/, '').trim();
      out.push({
        id: 'clarify-' + out.length,
        name: 'Needs clarification: ' + text.slice(0, 60),
        category: 'Other',
        tier: 'Deferred',
        why_needed: 'PRD flagged this as an open tech decision',
        evidence_quotes: [text],
        confidence: 'low',
        match_count: 1,
      });
    }
  }
  return out;
}

export function detectAxes(
  prdContent: string,
  opts?: { ignoreLock?: boolean },
): DetectResult {
  // Hard-OUT only on a build manifest (real code). Stack-locked PROSE does NOT hard-OUT —
  // completeness must still run for locked-stack greenfield projects.
  for (const sig of MANIFEST_SIGNALS) {
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
    let matchCount = 0;
    for (const line of lines) {
      if (seed.keywords.test(line)) {
        matchCount++;
        if (evidence.length < 2) evidence.push(line.trim()); // keep first 2 quotes, keep counting
      }
    }
    if (matchCount === 0) continue;
    const confidence: 'high' | 'low' = matchCount >= 2 ? 'high' : 'low';
    // Domain-gating: specialized non-webapp domains (Networking/Hardware) need ≥2 distinct
    // signals to emit. A single stray keyword (e.g. one "tunnel"/"proxy") on an unrelated PRD
    // must NOT promote a whole VPN/router axis. Core webapp axes emit on ≥1 (broadly applicable).
    const specialized = seed.category === 'Networking' || seed.category === 'Hardware';
    if (specialized && confidence === 'low') continue;
    axes.push({
      id: seed.id,
      name: seed.name,
      category: seed.category,
      tier: seed.tier,
      why_needed: seed.why_needed,
      evidence_quotes: evidence,
      confidence,
      match_count: matchCount,
    });
  }

  // L3 — NEEDS CLARIFICATION (dedup against already-detected llm etc. is fine; они Deferred)
  for (const c of harvestNeedsClarification(prdContent)) {
    axes.push(c);
  }

  // Stack-locked-in-prose: enumerate axes anyway (completeness still applies) but flag so the
  // workflow skips variant-picking and goes straight to the COMPLETENESS.md ledger + audit.
  let stackLocked = false;
  if (!opts?.ignoreLock) {
    for (const sig of STACK_LOCK_SIGNALS) {
      if (sig.test(prdContent)) {
        stackLocked = true;
        break;
      }
    }
  }

  return {
    axes_detected: axes.length,
    axes,
    ...(stackLocked ? { stack_locked: true } : {}),
  };
}
