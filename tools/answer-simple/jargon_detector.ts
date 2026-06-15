/**
 * Jargon detector for the agent's FINAL user-facing message.
 *
 * Decides whether a response is a "wall of internal codes" (FR-21 / ARCH012 /
 * VARIANT_COVERAGE … with no plain-language gloss) — the failure mode the user keeps
 * having to correct by hand. LENGTH IS NOT JUDGED (no word cap): a long answer in plain
 * language is fine; only UNDECODED PROJECT CODES block. The rule is about jargon, not size.
 *
 * Pure + side-effect-free so it is unit-testable in isolation; the Stop hook
 * (answer_simple_stop.ts) wraps it with anti-loop marker logic.
 *
 * Design guard (avoid H1 over-application — see memory
 * feedback_single-incident-rules-over-generalize): only fires on a USER-FACING
 * prose answer that is genuinely dense with project codes. Hard-OUT for messages that
 * are mostly code / diffs / tables (legitimate technical artifacts), so it never nags on
 * normal engineering output.
 */

export interface DetectOptions {
  /** Distinct internal codes tolerated before blocking (block at count > this). */
  maxCodes?: number;
  /** Below this prose:total ratio the message is mostly code/tables — hard-OUT. */
  minProseRatio?: number;
}

export interface DetectResult {
  block: boolean;
  reasons: string[];
  stats: { words: number; distinctCodes: number; codes: string[]; proseRatio: number };
}

const DEFAULTS: Required<DetectOptions> = {
  maxCodes: 2,
  minProseRatio: 0.55,
};

// Project-internal codes — NOT general engineering vocabulary. Each entry returns the
// matched literal so the block reason can name the offenders concretely.
const CODE_PATTERNS: RegExp[] = [
  /\b(?:FR|AC|NFR|UC|US|CHK)-?\d+(?:\.\d+)?[a-z]?\b/gi, // FR-21, FR-43c, AC-7.1, US-4
  /\bARCH-?\d{2,}\b/gi, // ARCH012
  /\bPLUGIN-?\d+\b/gi, // PLUGIN014
  /\bSPECGEN\d+(?:_\d+)?\b/gi, // SPECGEN003, SPECGEN004_155
  /\bP\d{1,2}-\d+\b/g, // P18-1, P21-5 (phase-task ids)
  /@feature\d+\b/gi, // @feature16
  /\bWave[-\s]?\d+\b/gi, // Wave 14
  /\bPhase\s?\d+(?:\.\d+)?\b/gi, // Phase 1.75
  /\bSTOP\s?#?\d+\b/gi, // STOP #3
  /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g, // VARIANT_COVERAGE (SCREAMING_SNAKE, ≥2 segments)
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, // not_run, rewrite_inbound (lowercase snake = code identifier in prose)
];

// Universal tech acronyms a technical reader knows — these stay ALLOWED even ALL-CAPS.
// Everything ELSE in SCREAMING caps (SUPERSEDED / HITL / REMOVED / DRIFTED / DENY …) is a
// shouted project status-code the reader does not know → counted as jargon.
const COMMON_ACRONYMS = new Set([
  'JSON', 'HTTP', 'HTTPS', 'HTML', 'CSS', 'API', 'URL', 'URI', 'SQL', 'YAML', 'XML', 'CSV',
  'UUID', 'ASCII', 'UTF8', 'CPU', 'GPU', 'RAM', 'SDK', 'CLI', 'IDE', 'REST', 'RPC', 'DNS',
  'SSH', 'TLS', 'SSL', 'JWT', 'PDF', 'PNG', 'JPEG', 'SVG', 'NULL', 'TRUE', 'FALSE',
  'TODO', 'DONE', 'PASS', 'FAIL', 'GREEN', 'RED', 'NPM', 'GIT', 'WSL', 'OK',
]);
// A single SCREAMING word ≥4 letters (no underscore) — checked against the allowlist.
const SCREAMING_RE = /\b[A-Z]{4,}\b/g;

/** Remove fenced + inline code and markdown tables so we only judge user-facing prose. */
function stripNonProse(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`[^`\n]+`/g, ' ') // inline code (file paths, identifiers)
    .replace(/^\s*\|.*\|\s*$/gm, ' '); // markdown table rows
}

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function detectJargon(message: string, opts: DetectOptions = {}): DetectResult {
  const cfg = { ...DEFAULTS, ...opts };
  const reasons: string[] = [];

  const prose = stripNonProse(message);
  const proseWords = countWords(prose);
  // proseRatio = prose vs the RAW message (code counted in the denominator only) —
  // so a code/diff/table-heavy answer scores low and is hard-OUT'd.
  const totalWords = countWords(message) || 1;
  const proseRatio = Math.min(1, proseWords / totalWords);

  // Distinct internal codes in PROSE only (code blocks already stripped).
  const found = new Set<string>();
  for (const re of CODE_PATTERNS) {
    for (const m of prose.matchAll(re)) found.add(m[0].toLowerCase());
  }
  // Single SCREAMING words (HITL / SUPERSEDED / REMOVED …) not in the universal-acronym
  // allowlist — a shouted project status-code the reader does not know.
  for (const m of prose.matchAll(SCREAMING_RE)) {
    if (!COMMON_ACRONYMS.has(m[0])) found.add(m[0].toLowerCase());
  }
  const codes = [...found];
  const stats = { words: proseWords, distinctCodes: codes.length, codes, proseRatio };

  // Hard-OUT: mostly code / diffs / tables → legitimate technical output, never nag.
  if (proseRatio < cfg.minProseRatio) return { block: false, reasons, stats };

  // The ONLY block trigger: a wall of undecoded internal codes. Length is never judged.
  if (codes.length > cfg.maxCodes) {
    const shown = codes.slice(0, 6).join(', ');
    reasons.push(
      `Стена внутренних кодов (${codes.length}): ${shown}${codes.length > 6 ? ', …' : ''}. ` +
        `Перепиши простым языком — расшифруй каждый код в скобках бытовыми словами или убери. ` +
        `Читатель не обязан знать что значат эти коды.`,
    );
  }

  return { block: reasons.length > 0, reasons, stats };
}
